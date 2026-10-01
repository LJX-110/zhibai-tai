/**
 * AI Provider —— 统一文本调用接口与其实现
 *
 * 本地（规则/离线）实现 + 远程（DeepSeek 等 OpenAI 兼容）实现。
 * 新增 Provider 只需实现 complete()，高层能力不关心底层是哪一家。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：原先写在 ai-service.ts 里的
 * Provider 接口与两套实现（本地规则 / OpenAI 兼容）整体搬到本文件；
 * ai-service.ts 仍从原路径 re-export，外部调用方无需改动。
 */
export interface AIProvider {
  id: string
  name: string
  /** 统一文本调用入口（本地规则 / 远程 API 皆实现此方法） */
  complete(prompt: string): Promise<string>
  /**
   * 流式补全（**可选**）。支持时面板边生成边显示；不支持则由调用方回退到 `complete`。
   * onToken 每收到一段增量文本调用一次（可能高频触发，调用方自行节流）；
   * signal 供用户主动中止。
   * onFinish 在流结束时回调一次：`reason` 为 'length' 表示回答被 max_tokens 截断
   * （此时必须告诉用户，否则看起来像自然结束），`usage` 是服务端的用量统计原样透传。
   */
  completeStream?(
    prompt: string,
    onToken: (delta: string) => void,
    signal?: AbortSignal,
    onFinish?: (info: StreamFinishInfo) => void,
  ): Promise<string>
  /**
   * 拉取可用模型列表（**可选**）。设置页的模型下拉用它；
   * 端点不提供 `/models` 时不实现此方法，由调用方提示手填模型名。
   */
  listModels?(): Promise<string[]>
  /**
   * 轻量连通性检查（**可选**）：只验证「端点可达 + Key 有效」。
   * 优先走 `/models`（不计费）；端点不支持该路由、或该路由超时/不可达时，
   * 回退一次极短的补全（对话路由才是应用真正要用的那条）。
   * 失败时抛出的错误与 `complete` 同形（`AI 请求失败 HTTP …`），
   * 由 `ai-service` 的 `explainConnectFailure` 统一译成人话。
   */
  testConnection?(): Promise<void>
  /** 是否可用 */
  available(): boolean
}

/** 一次流式调用的结束信息 */
export interface StreamFinishInfo {
  /** 'stop' 正常结束；'length' 被截断；其余值原样透传 */
  reason?: string
  /** 服务端用量统计（各端点字段不一致，不做归一化） */
  usage?: unknown
}

/** 本地轻量 Provider（离线可用，无网络） */
export const localProvider: AIProvider = {
  id: 'local',
  name: '本地规则',
  available: () => true,
  complete: async (prompt: string) => {
    // 纯规则：不虚构智能，仅做结构化整理
    return `（本地规则处理）${prompt}`
  },
}

/** 远程请求共用的系统提示 */
const SYSTEM_PROMPT =
  '你是知白台（个人效率系统）的 AI 助手。回答简洁、有条理，使用中文。'

/** 测试连接里给 `/models` 的探测超时（10s）：
 *  该路由在部分网关上会挂起（实测 Agnes 3 次里 2 次 20s 无响应），
 *  不能让一次探测拖满整个请求超时（30s）才轮到回退。 */
const PROBE_TIMEOUT_MS = 10_000

/** OpenAI 兼容 Provider 工厂（Agnes / DeepSeek / Kimi / OpenAI 等） */
export function openAICompatibleProvider(opts: {
  baseUrl: string
  apiKey: string
  model: string
  name?: string
  timeoutMs?: number
}): AIProvider {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const timeoutMs = opts.timeoutMs ?? 30000
  /** 拉模型列表：带超时的最小 GET（原先这段裸 fetch 写在设置页组件里，无超时） */
  const fetchModels = async (overrideMs?: number): Promise<string[]> => {
    if (!opts.apiKey) throw new Error('未配置 API Key')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), overrideMs ?? timeoutMs)
    try {
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${opts.apiKey}` },
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`AI 请求失败 HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`)
      }
      const data = (await res.json()) as { data?: { id?: string }[] }
      return (data.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x))
    } finally {
      clearTimeout(timer)
    }
  }
  return {
    id: 'remote',
    name: opts.name ?? opts.model,
    available: () => Boolean(opts.apiKey && opts.baseUrl),
    listModels: fetchModels,
    testConnection: async () => {
      // 连通性判据：优先 `/models`（不计费、无生成开销）——但它**不是所有端点都可靠**。
      // 实测（2026-10-01）：Agnes 的 `/models` 在其网关上会偶发挂起（3 次里 2 次超时），
      // 而同一时刻它的对话路由完全正常（`POST /chat/completions` 稳定响应）。
      // 所以「/models 不可用」≠「端点不可用」——下列两类都回退到真正要用的那条路做判据：
      //  · 400/404/405：端点没有该路由；
      //  · 超时 / 网络类失败（拿不到 HTTP 状态码）：该路由不通，但对话路由可能好着。
      // 401/402/403/429/5xx 仍原样抛出：那是确凿的「不可用」信号，不许被回退掩盖。
      try {
        await fetchModels(PROBE_TIMEOUT_MS)
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)
        const status = Number(raw.match(/HTTP (\d{3})/)?.[1] ?? NaN)
        const routeMissing = status === 400 || status === 404 || status === 405
        const routeUnreachable = Number.isNaN(status)
        if (!routeMissing && !routeUnreachable) throw e
        // 回退：一次极短补全（max_tokens: 1）——它才是应用真正要用的那条路
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), timeoutMs)
        try {
          const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify({
              model: opts.model,
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
            signal: ctrl.signal,
          })
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(`AI 请求失败 HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`)
          }
        } finally {
          clearTimeout(timer)
        }
      }
    },
    complete: async (prompt: string) => {
      if (!opts.apiKey) throw new Error('未配置 API Key')
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: opts.model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          }),
          signal: ctrl.signal,
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`AI 请求失败 HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`)
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
        const content = data.choices?.[0]?.message?.content
        if (!content) throw new Error('AI 响应为空')
        return content
      } finally {
        clearTimeout(timer)
      }
    },
    completeStream: async (prompt, onToken, signal, onFinish) => {
      if (!opts.apiKey) throw new Error('未配置 API Key')
      const ctrl = new AbortController()
      const relayAbort = () => ctrl.abort()
      signal?.addEventListener('abort', relayAbort)

      // 流式**不能**用一个总超时：长回答必然超过任何固定时长。
      // 改为两段看门狗 —— 首字节超时（连不上/被限流） + 空闲超时（中途卡死）。
      // ⚠️ 定时器用全局 setTimeout 而非 window.setTimeout：后者在非浏览器环境
      // （node 单测）下直接 ReferenceError，会把整条流式链路挡在测试之外。
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const armIdle = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => ctrl.abort(), 60_000)
      }
      const firstByteTimer = setTimeout(() => ctrl.abort(), timeoutMs)

      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: opts.model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
            stream: true,
          }),
          signal: ctrl.signal,
        })
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '')
          throw new Error(`AI 请求失败 HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let acc = ''
        let finishReason: string | undefined
        let usage: unknown
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          clearTimeout(firstByteTimer)
          armIdle()
          buffer += decoder.decode(value, { stream: true })
          // SSE 以空行分隔事件；按行扫描即可，残缺的最后一行留到下一轮
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const raw of lines) {
            const line = raw.trim()
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const chunk = JSON.parse(payload) as {
                choices?: { delta?: { content?: string }; finish_reason?: string }[]
                usage?: unknown
              }
              const choice = chunk.choices?.[0]
              if (choice?.finish_reason) finishReason = choice.finish_reason
              if (chunk.usage) usage = chunk.usage
              const delta = choice?.delta?.content
              if (delta) {
                acc += delta
                onToken(delta)
              }
            } catch {
              /* 心跳/注释等非 JSON 行，忽略 */
            }
          }
        }
        // 结束信息先于「空响应」校验：即使没吐一个字，调用方也该知道为什么结束
        onFinish?.({ reason: finishReason, usage })
        if (!acc) throw new Error('AI 响应为空')
        return acc
      } finally {
        clearTimeout(firstByteTimer)
        clearTimeout(idleTimer)
        signal?.removeEventListener('abort', relayAbort)
      }
    },
  }
}
