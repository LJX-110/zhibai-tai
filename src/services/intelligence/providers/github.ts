/**
 * GitHub Provider —— 真实数据（公共搜索 API，无需 Token）
 *
 * 通道选择沿用全站统一的 proxyFetch 双通道：
 *  · api.github.com 属于 DIRECT_HOSTS（自带 CORS），直连优先；
 *  · 国内网络直连不通时，若已配置自建代理则自动经代理转发兜底。
 * 此前这里用原生 fetch 直连：没配代理时国内必然超时 → 「GitHub 0 条」。
 *
 * 第三道保险：直连与代理全部失败、且已配置远程 AI 时，退化为
 * 「AI 生成 GitHub 热门仓库情报」——保住该源永远不为空（消耗少量额度，
 * 但比一片红叉更能说明「网络没通，主题还在」）。
 * 搜索词从源 config 读取（JSON：{ queries: string[] }），不硬编码。
 */
import { createId } from '../../../utils/id'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import { aiService } from '../../ai/ai-service'
import { proxyFetch } from './proxy'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'

interface GHItem {
  id: number
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  language: string | null
  topics: string[]
  updated_at: string
  owner: { login: string; avatar_url: string }
}

async function searchRepos(query: string, signal?: AbortSignal): Promise<GHItem[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=8`
  const text = await proxyFetch(url, useSettingsStore.getState().corsProxyUrl, signal)
  const data = JSON.parse(text) as { items?: GHItem[] }
  return data.items ?? []
}

/** 读取源配置中的搜索词 */
function queriesOf(source: IntelligenceSource): string[] {
  if (source.config) {
    try {
      const cfg = JSON.parse(source.config) as { queries?: string[] }
      if (Array.isArray(cfg.queries) && cfg.queries.length > 0) return cfg.queries
    } catch {
      // 配置损坏则用默认
    }
  }
  return ['topic:react+created:>2026-01-01', 'topic:local-first', 'topic:pwa']
}

/** 网络通道全断时的 AI 兜底：围绕主题生成热门仓库情报（源类型仍记 github） */
async function aiFallbackRepo(
  source: IntelligenceSource,
  queries: string[],
  signal?: AbortSignal,
): Promise<IntelligenceItem[]> {
  const provider = aiService.provider
  if (provider.id !== 'remote' || !provider.available() || signal?.aborted) return []
  const topic = queries[0] ?? source.name ?? '热门开源项目'
  const prompt = `你是 GitHub 情报助手。围绕查询「${topic}」，列出 ${Math.min(6, queries.length + 3)} 个近期（一年内）**真实存在**的热门开源仓库，格式严格为 JSON 数组：\n[\n  {"full_name": "owner/repo", "description": "一句话中文简介", "html_url": "https://github.com/owner/repo", "stargazers_count": 1234, "language": "JavaScript"}\n]\n只输出 JSON。若查询确实无匹配，输出 []。`

  const raw = await provider.complete(prompt)
  if (!raw || signal?.aborted) return []
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: { full_name?: string; description?: string; html_url?: string; stargazers_count?: number; language?: string }[]
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
    .filter((it) => it && typeof it.full_name === 'string' && it.full_name.trim())
    .map((it): IntelligenceItem => ({
      id: createId(),
      title: it.full_name!.trim(),
      source: source.name,
      sourceName: source.name,
      sourceType: 'github',
      category: source.category || 'GitHub',
      tags: [it.language ?? '代码', 'AI 补足'],
      url: typeof it.html_url === 'string' ? it.html_url : `https://github.com/${it.full_name}`,
      summary: it.description ?? `${it.stargazers_count ?? '—'} ★`,
      read: false,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      convertedToNoteId: null,
      convertedToTaskId: null,
    }))
}

export const githubProvider: IntelligenceProvider = {
  id: 'github',
  name: 'GitHub',
  fetch: async (source, signal) => {
    const queries = queriesOf(source)
    let items: GHItem[] = []
    let networkFailed = false
    try {
      const results = await Promise.allSettled(queries.map((q) => searchRepos(q, signal)))
      networkFailed = results.some((r) => r.status === 'rejected')
      items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    } catch {
      networkFailed = true
    }

    // 网络全断（典型：未配自建代理 + 国内直连超时）→ AI 兜底，避免恒为 0 条
    if (items.length === 0 && networkFailed) {
      const fallback = await aiFallbackRepo(source, queries, signal)
      if (fallback.length > 0) return fallback
    }

    const now = new Date().toISOString()

    const seen = new Set<number>()
    return items
      .filter((it) => {
        if (seen.has(it.id)) return false
        seen.add(it.id)
        return true
      })
      .map((it): IntelligenceItem => ({
        id: createId(),
        title: it.full_name,
        source: source.name,
        sourceName: source.name,
        sourceType: 'github',
        category: source.category || 'GitHub',
        tags: [it.language ?? '代码', ...(it.topics ?? []).slice(0, 3)],
        url: it.html_url,
        image: it.owner.avatar_url,
        summary:
          it.description ??
          `${it.stargazers_count} ★ · 最近更新 ${it.updated_at.slice(0, 10)}`,
        author: it.owner.login,
        publishedAt: it.updated_at,
        read: false,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        convertedToNoteId: null,
        convertedToTaskId: null,
      }))
  },
}
