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
   */
  completeStream?(
    prompt: string,
    onToken: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string>
  /** 是否可用 */
  available(): boolean
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
  return {
    id: 'remote',
    name: opts.name ?? opts.model,
    available: () => Boolean(opts.apiKey && opts.baseUrl),
    complete: async (prompt: string) => {
      if (!opts.apiKey) throw new Error('未配置 API Key')
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
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
        window.clearTimeout(timer)
      }
    },
    completeStream: async (prompt, onToken, signal) => {
      if (!opts.apiKey) throw new Error('未配置 API Key')
      const ctrl = new AbortController()
      const relayAbort = () => ctrl.abort()
      signal?.addEventListener('abort', relayAbort)

      // 流式**不能**用一个总超时：长回答必然超过任何固定时长。
      // 改为两段看门狗 —— 首字节超时（连不上/被限流） + 空闲超时（中途卡死）。
      let idleTimer: number | undefined
      const armIdle = () => {
        window.clearTimeout(idleTimer)
        idleTimer = window.setTimeout(() => ctrl.abort(), 60_000)
      }
      const firstByteTimer = window.setTimeout(() => ctrl.abort(), timeoutMs)

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
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          window.clearTimeout(firstByteTimer)
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
                choices?: { delta?: { content?: string } }[]
              }
              const delta = chunk.choices?.[0]?.delta?.content
              if (delta) {
                acc += delta
                onToken(delta)
              }
            } catch {
              /* 心跳/注释等非 JSON 行，忽略 */
            }
          }
        }
        if (!acc) throw new Error('AI 响应为空')
        return acc
      } finally {
        window.clearTimeout(firstByteTimer)
        window.clearTimeout(idleTimer)
        signal?.removeEventListener('abort', relayAbort)
      }
    },
  }
}
