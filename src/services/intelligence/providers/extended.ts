/**
 * 扩展 Provider —— Steam News / RAWG / Jikan（真实公开 API）
 * 配置均来自 IntelligenceSource.config（JSON），API Key 不写入源码。
 */
import { createId } from '../../../utils/id'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import { fetchViaProxy } from './rss'
import type { IntelligenceProvider } from './index'

function cfgOf(source: IntelligenceSource): Record<string, unknown> {
  if (!source.config) return {}
  try {
    return JSON.parse(source.config) as Record<string, unknown>
  } catch {
    return {}
  }
}

function base(source: IntelligenceSource, sourceType: 'game' | 'anime'): Omit<
  IntelligenceItem,
  'id'
> {
  return {
    title: '',
    source: source.name,
    sourceName: source.name,
    sourceType,
    category: source.category,
    tags: [source.category],
    read: false,
    favorite: false,
    createdAt: new Date().toISOString(),
  }
}

/** Steam News —— 公开新闻接口（无需登录；直连受限时走 CORS 代理） */
export const steamProvider: IntelligenceProvider = {
  id: 'steam',
  name: 'Steam',
  fetch: async (source, signal) => {
    const cfg = cfgOf(source)
    const appid = Number(cfg.appid ?? 730)
    const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=12&maxlength=300`
    let text: string
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(String(res.status))
      text = await res.text()
    } catch {
      text = await fetchViaProxy(url, signal)
    }
    const json = JSON.parse(text) as {
      appnews?: { newsitems?: { gid: string; title: string; url: string; contents: string; date: number }[] }
    }
    const items = json.appnews?.newsitems ?? []
    return items.map((n) => ({
      ...base(source, 'game'),
      id: createId(),
      externalId: String(n.gid),
      title: n.title,
      url: n.url,
      summary: n.contents?.slice(0, 200),
      publishedAt: new Date(n.date * 1000).toISOString(),
      tags: ['Steam', `App${appid}`],
    }))
  },
}

/** RAWG —— 游戏元数据（需在源配置填入 key，绝不写源码） */
export const rawgProvider: IntelligenceProvider = {
  id: 'rawg',
  name: 'RAWG',
  fetch: async (source, signal) => {
    const cfg = cfgOf(source)
    const key = String(cfg.key ?? '')
    if (!key) return []
    const date = new Date()
    const from = new Date(date.getFullYear(), date.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 10)
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&dates=${from},2099-12-31&ordering=-added&page_size=12`
    const res = await fetch(url, { signal })
    if (!res.ok) return []
    const json = (await res.json()) as {
      results?: {
        id: number
        name: string
        background_image?: string
        released?: string
        platforms?: { platform: { name: string } }[]
        genres?: { name: string }[]
        slug: string
      }[]
    }
    return (json.results ?? []).map((g) => ({
      ...base(source, 'game'),
      id: createId(),
      externalId: String(g.id),
      title: g.name,
      url: `https://rawg.io/games/${g.slug}`,
      image: g.background_image,
      summary: `发行：${g.released ?? '未知'} · 平台：${(g.platforms ?? []).map((p) => p.platform.name).slice(0, 4).join('/')}`,
      publishedAt: g.released ? new Date(g.released).toISOString() : undefined,
      tags: [...(g.genres ?? []).map((x) => x.name)],
    }))
  },
}

/** Jikan —— MyAnimeList 公开 API（无需 Key） */
export const jikanProvider: IntelligenceProvider = {
  id: 'jikan',
  name: 'Jikan',
  fetch: async (source, signal) => {
    const cfg = cfgOf(source)
    const mode = String(cfg.mode ?? 'season') // season | top | search
    const type = String(cfg.type ?? 'anime') // anime | manga
    let url: string
    if (mode === 'search') {
      const q = String(cfg.q ?? '')
      url = `https://api.jikan.moe/v4/${type}?q=${encodeURIComponent(q)}&limit=12&order_by=score&sort=desc`
    } else if (mode === 'top') {
      url = `https://api.jikan.moe/v4/top/${type}?limit=12`
    } else {
      url = `https://api.jikan.moe/v4/seasons/now?filter=${type === 'manga' ? 'manga' : 'tv'}&limit=12`
    }
    const res = await fetch(url, { signal })
    if (!res.ok) return []
    const json = (await res.json()) as {
      data?: {
        mal_id: number
        title: string
        images?: { jpg?: { large_image_url?: string } }
        synopsis?: string
        score?: number
        genres?: { name: string }[]
        status?: string
        aired?: { from?: string }
        url?: string
      }[]
    }
    return (json.data ?? []).map((d) => ({
      ...base(source, 'anime'),
      id: createId(),
      externalId: String(d.mal_id),
      title: d.title,
      url: d.url,
      image: d.images?.jpg?.large_image_url,
      summary: d.synopsis?.slice(0, 180),
      publishedAt: d.aired?.from ?? undefined,
      tags: [...(d.genres ?? []).map((g) => g.name)],
      ...(d.status ? { aiSummary: `状态：${d.status}` } : {}),
      ...(d.score != null ? { author: `评分 ${d.score}` } : {}),
    }))
  },
}
