/**
 * AI Provider —— 用已配置的远程 AI 生成情报（真实抓取断线的兜底）
 *
 * 用途：直连/自建代理都不可达时，若用户已配置远程 AI，还能把
 * 「该主题近期值得关注什么」问出来，而不是收获一排红叉。
 * 生成本身消耗 API 额度，所以：
 *  · 只有源 config 显式启用才注册（provider: 'ai'，不随默认源播种）；
 *  · 返回体刻意指定 JSON，解析失败/超时/未配 AI 一律返回空数组（不抛错）；
 *  · source.lastError 由 fetchFromSource 的正常语义记录，界面照常显示。
 */
import { createId } from '../../../utils/id'
import { aiService } from '../../ai/ai-service'
import type { IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'

interface AiPromptConfig {
  /** 让 AI 围绕的主题（缺省用源名） */
  topic?: string
  /** 期望条数 1-8，缺省 4 */
  count?: number
}

function configOf(source: IntelligenceSource): AiPromptConfig {
  if (!source.config) return {}
  try {
    return JSON.parse(source.config) as AiPromptConfig
  } catch {
    return {}
  }
}

export const aiProvider: IntelligenceProvider = {
  id: 'ai',
  name: 'AI 情报',
  fetch: async (source, signal) => {
    const provider = aiService.provider
    // 未启用远程模型：AI 兜底无从谈起，安静返回（别浪费一次「本地规则」的空转）
    if (provider.id !== 'remote' || !provider.available()) return []
    if (signal?.aborted) return []

    const { topic, count } = configOf(source)
    const name = topic ?? source.name ?? '当前主题'
    const n = Math.max(1, Math.min(8, count ?? 4))
    const prompt = `你是情报整理助手。围绕主题「${name}」，列出近期（近一个月）最值得关注的 ${n} 条**真实、具体**的信息，每条一行，格式严格为 JSON 数组：\n[\n  {"title": "信息标题", "summary": "一句话要点", "url": "http://…", "tags": ["标签1","标签2"]}\n]\n只输出 JSON，不要其他文字。若确实没有可靠信息，输出 []。`

    const raw = await provider.complete(prompt)
    if (!raw || signal?.aborted) return []

    // 模型可能用 ```json 包裹，剥掉围栏再解析
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let parsed: { title: string; summary?: string; url?: string; tags?: string[] }[]
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const m = cleaned.match(/\[[\s\S]*\]/)
      if (!m) return []
      try {
        parsed = JSON.parse(m[0])
      } catch {
        return []
      }
    }
    if (!Array.isArray(parsed)) return []

    const now = new Date().toISOString()
    return parsed
      .filter((it) => it && typeof it.title === 'string' && it.title.trim())
      .slice(0, n)
      .map((it) => ({
        id: createId(),
        title: it.title.trim(),
        source: source.name,
        sourceName: source.name,
        sourceType: 'ai' as const,
        category: source.category || 'AI',
        tags: Array.isArray(it.tags) ? it.tags.slice(0, 4) : [source.category || 'AI'],
        url: typeof it.url === 'string' ? it.url : undefined,
        summary: typeof it.summary === 'string' ? it.summary : undefined,
        read: false,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        convertedToNoteId: null,
        convertedToTaskId: null,
      }))
  },
}