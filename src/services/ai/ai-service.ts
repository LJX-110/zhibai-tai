/**
 * AI 能力服务 —— 统一 Provider 接口
 * 本地（规则/离线）实现 + 远程（DeepSeek 等 OpenAI 兼容）占位
 * 高层能力：summarize / classify / tag / rank / extract / toInspiration / toTask / projectSummary / studyPlan / dailyBrief
 * 不把具体 API 写死：新增 Provider 只实现 complete()
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：原先 533 行拆为同目录三份 ——
 *   provider.ts    Provider 接口 + 本地规则实现 + OpenAI 兼容工厂
 *   capabilities.ts AIService 接口 + aiService 各高层能力实现
 * 本文件只留「读设置 → 装配 Provider」与兼容导出。
 * 所有公共符号仍从本路径导出，外部调用方无需改动。
 */
import { useSettingsStore } from '../../stores/useSettingsStore'
import { encryptor } from '../../sync/encryption/encryption'
import type { IntelligenceItem } from '../../types/entities'
import { aiService } from './capabilities'
import { markAiRemoteReady, markAiUnconfigured } from './health'
import { localProvider, openAICompatibleProvider } from './provider'
import type { AIProvider } from './provider'

export type { AIProvider } from './provider'
export { localProvider, openAICompatibleProvider } from './provider'
export type { AIService } from './capabilities'
export { aiService } from './capabilities'

/**
 * 根据设置解析当前 AI Provider（local / remote-OpenAI兼容）
 *
 * 顺带把远程状态推到 `health`：**配好了**算 `ready`（乐观假设，真正的证明是
 * 一次成功调用），没配 Key 算 `unconfigured`。调用失败改由 capabilities 那边
 * 标成 `degraded`。
 */
export async function resolveAIProvider(): Promise<AIProvider> {
  const s = useSettingsStore.getState()
  if (s.aiProvider === 'remote' && s.aiKey) {
    try {
      const key = s.aiKeyEnc ? await encryptor.decrypt(s.aiKey) : s.aiKey
      if (key) {
        const p = openAICompatibleProvider({ baseUrl: s.aiBaseUrl, apiKey: key, model: s.aiModel, name: '远程模型' })
        aiService.use(p)
        markAiRemoteReady()
        return p
      }
    } catch {
      /* 解密失败 → 回退本地（此时确实等于没配好，按未配置处理） */
    }
  }
  aiService.use(localProvider)
  markAiUnconfigured()
  return localProvider
}

/**
 * 测试远程 AI 连接（返回人类可读结果）
 *
 * 失败时**必须给出可操作的原因**：这条消息是用户唯一的线索来源，一句"连接失败"
 * 会让人无从下手。浏览器里最常见的四种失败各有各的解法（Key / 额度 / 跨域 / 超时），
 * 所以这里逐类翻译成人话。
 */
export async function testAIProvider(): Promise<{ ok: boolean; message: string }> {
  const s = useSettingsStore.getState()
  if (!s.aiKey) return { ok: false, message: '尚未保存 API Key —— 先填 Key 点「加密保存」' }
  try {
    const key = s.aiKeyEnc ? await encryptor.decrypt(s.aiKey) : s.aiKey
    const p = openAICompatibleProvider({ baseUrl: s.aiBaseUrl, apiKey: key, model: s.aiModel })
    // 走 Provider 的连通性检查（优先 /models，不计费）；旧 Provider 无此方法时回退一次补全
    if (p.testConnection) await p.testConnection()
    else await p.complete('用一句话确认连接成功。')
    return { ok: true, message: `连接成功：${hostOf(s.aiBaseUrl)} · ${s.aiModel}` }
  } catch (e) {
    return { ok: false, message: explainConnectFailure(e) }
  }
}

/**
 * 拉取当前 Provider 的模型列表（OpenAI 兼容 `/models`）。
 *
 * 结果带上 `baseUrl`：调用方据此判断"这批模型是不是当前端点的"——
 * 换端点后旧列表必须失效，否则会选中一个不属于当前服务的模型名。
 * 端点不支持列表接口时不算失败，如实说明"可手填模型名"。
 */
export async function listAIModels(): Promise<{
  ok: boolean
  models: string[]
  baseUrl: string
  message: string
  /** true = 真的出错了（该报 danger）；false = 只是端点没有列表接口（如实说明即可） */
  fatal: boolean
}> {
  const s = useSettingsStore.getState()
  const baseUrl = s.aiBaseUrl
  if (!s.aiKey) return { ok: false, models: [], baseUrl, fatal: false, message: '先保存 API Key 再拉取模型列表' }
  try {
    const key = s.aiKeyEnc ? await encryptor.decrypt(s.aiKey) : s.aiKey
    const p = openAICompatibleProvider({ baseUrl, apiKey: key, model: s.aiModel })
    const models = (await p.listModels?.()) ?? []
    if (models.length === 0) {
      return { ok: false, models: [], baseUrl, fatal: false, message: '该端点没有返回模型列表 —— 直接手填模型名即可' }
    }
    return { ok: true, models, baseUrl, fatal: false, message: `拉到 ${models.length} 个模型` }
  } catch (e) {
    return { ok: false, models: [], baseUrl, fatal: true, message: explainConnectFailure(e) }
  }
}

/** 取 baseUrl 的主机名，给成功回执一个人能读的服务标识（解析失败返回原文） */
function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

/**
 * 连接失败 → 人话。分两类：
 *  · 能拿到 HTTP 状态码的（provider 里包成 "AI 请求失败 HTTP 401：…"）→ 按状态码给动作；
 *  · 拿不到的（fetch 直接抛）→ 看 error.name 判断是超时还是跨域/网络。
 *    ⚠️ 浏览器无法区分「跨域被拦」与「断网」（都表现为 TypeError: Failed to fetch），
 *    所以文案把两种可能都写出来，不假装知道是哪一种。
 */
function explainConnectFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const status = Number(raw.match(/HTTP (\d{3})/)?.[1])

  if (status === 401 || status === 403) return `Key 无效或无权限（HTTP ${status}）—— 检查 Key 是否填错、是否已过期`
  if (status === 402) return '账户额度不足（HTTP 402）—— 去服务商控制台充值或换免费端点'
  if (status === 404) return '接口地址或模型名不存在（HTTP 404）—— 检查 Base URL 是否以 /v1 结尾、模型名是否正确'
  if (status === 429) return '触发限流（HTTP 429）—— 稍后重试，或换用免费端点的其他模型'
  if (status && status >= 500) return `服务端异常（HTTP ${status}）—— 多为服务商临时故障，稍后重试`

  if (e instanceof Error && e.name === 'AbortError') return '请求超时（30 秒无响应）—— 检查网络，或换一个允许浏览器直连的服务'

  return `连不上：${raw}。大概率是跨域被拦 —— 当前浏览器无法直接连接此服务（服务端未开放跨域），或只是网络不通；浏览器区分不了这两种，请先确认网络，再改用 DeepSeek / Kimi 这类支持浏览器直连的服务`
}

/** 兼容早期导出格式（原 localAIService） */
export const localAIService: {
  summarize: (item: IntelligenceItem) => Promise<string>
  classify: (item: IntelligenceItem) => Promise<string>
  extractTags: (item: IntelligenceItem) => Promise<string[]>
} = {
  summarize: (item) => aiService.summarize(item),
  classify: (item) => aiService.classify(item),
  extractTags: (item) => aiService.tag(item),
}
