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

/** 测试远程 AI 连接（返回人类可读结果） */
export async function testAIProvider(): Promise<{ ok: boolean; message: string }> {
  const s = useSettingsStore.getState()
  if (!s.aiKey) return { ok: false, message: '未配置 API Key' }
  try {
    const key = s.aiKeyEnc ? await encryptor.decrypt(s.aiKey) : s.aiKey
    const p = openAICompatibleProvider({ baseUrl: s.aiBaseUrl, apiKey: key, model: s.aiModel })
    const reply = await p.complete('用一句话确认连接成功。')
    return { ok: true, message: `连接成功：${reply.slice(0, 60)}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '连接失败' }
  }
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
