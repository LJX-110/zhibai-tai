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
    const reply = await p.complete('用一句话确认连接成功。')
    return { ok: true, message: `连接成功：${reply.slice(0, 60)}` }
  } catch (e) {
    return { ok: false, message: explainConnectFailure(e) }
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

  if (e instanceof Error && e.name === 'AbortError') return '请求超时（30 秒无响应）—— 检查网络，或确认该端点不允许浏览器直连'

  return `连不上：${raw}。可能是跨域被拦（该端点不允许浏览器直连，需自建转发）或网络不通 —— 浏览器区分不了这两种，请先确认网络，再试换端点`
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
