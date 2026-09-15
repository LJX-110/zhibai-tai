/**
 * GitHub Provider —— 真实数据（公共搜索 API，无需 Token）
 *
 * 通道选择沿用全站统一的 proxyFetch 双通道：
 *  · api.github.com 属于 DIRECT_HOSTS（自带 CORS），直连优先；
 *  · 国内网络直连不通时，若已配置自建代理则自动经代理转发兜底。
 * 此前这里用原生 fetch 直连：没配代理时国内必然超时 → 「GitHub 0 条」。
 * 搜索词从源 config 读取（JSON：{ queries: string[] }），不硬编码。
 */
import { createId } from '../../../utils/id'
import { useSettingsStore } from '../../../stores/useSettingsStore'
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

export const githubProvider: IntelligenceProvider = {
  id: 'github',
  name: 'GitHub',
  fetch: async (source, signal) => {
    const results = await Promise.allSettled(queriesOf(source).map((q) => searchRepos(q, signal)))
    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
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
