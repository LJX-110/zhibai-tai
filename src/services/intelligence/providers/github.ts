/**
 * GitHub Provider —— 真实数据（公共搜索 API，无需 Token）
 *
 * 通道选择沿用全站统一的 proxyFetch 双通道：
 *  · api.github.com 属于 DIRECT_HOSTS（自带 CORS），直连优先；
 *  · 国内网络直连不通时，若已配置自建代理则自动经代理转发兜底。
 * 搜索词从源 config 读取（JSON：{ queries: string[] }），不硬编码。
 *
 * ## Step 5-1 · C2：删除了「AI 兜底生成热门仓库」
 * 上一版在"直连与代理全失败、且配了远程 AI"时，会让模型**编出**一批热门仓库并
 * 当成该源的情报返回（`sourceType: 'github'`、URL 与 star 数都不校验，
 * 只靠一个 `AI 补足` 标签区分）。这与"情报只来自真实来源"直接冲突：
 * 标题、来源、数字都长得像真的，用户无法分辨哪条是真的。
 *
 * 现在：**全部查询都失败 → 原样抛错**。交给 `run.ts` 记 `lastError` + `failCount`，
 * 旧数据原样保留（不落新数据），其他源继续抓 —— 这才是"真实的失败"该有的样子。
 *
 * ⚠️ 顺带修掉一个静默错误：上一版把"全部查询失败"吞成 `items = []` 并**正常返回**，
 * 于是 `run.ts` 会把它记成**一次成功**（写 `lastSuccessAt`、清零 `failCount`），
 * 界面上那个源看起来是好的、其实一条都没抓到。
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
    const queries = queriesOf(source)
    // 每个查询各自成败：一个查询超时不该把其余查询的结果一起丢掉
    const results = await Promise.allSettled(queries.map((q) => searchRepos(q, signal)))
    const failed = results.filter((r) => r.status === 'rejected')
    const items: GHItem[] = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

    // 全部查询都失败 = 这条源这次**真的失败了**：如实抛错，不伪造、不吞掉。
    // （部分成功但总数为 0 是合法结果 —— 那就是"没搜到"，正常返回空数组。）
    if (items.length === 0 && failed.length === queries.length) {
      const first = failed[0]
      throw first.reason instanceof Error ? first.reason : new Error(String(first.reason))
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

