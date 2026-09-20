/**
 * 扩展 Provider —— Steam News / RAWG / Jikan（真实公开 API）
 * 配置均来自 IntelligenceSource.config（JSON），API Key 不写入源码。
 *
 * 三个 Provider 统一走 `fetchViaProxy`：它是全站唯一的抓取出口，
 * 自带**按候选通道计时的超时**与错误分类。此前它们各自用裸 `fetch(url, { signal })`，
 * 没有超时也没有人管 signal 会不会被 abort —— 对方挂着不回，这个源就永远停在「抓取中」。
 */
import { createId } from '../../../utils/id'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import { fetchViaProxy } from './rss'
import { cfgOf, type IntelligenceProvider } from './index'

/**
 * 上游被风控或路由写错时会返回 HTML 错误页，
 * 直接 JSON.parse 抛出的 "Unexpected token '<'" 看不出是哪个接口出的问题。
 */
function parseUpstream<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`parse: ${label}返回非 JSON（很可能是错误页或被风控拦截）`)
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

/** Steam News —— 公开新闻接口（无需登录；直连受限时自动经自建代理转发） */
export const steamProvider: IntelligenceProvider = {
  id: 'steam',
  name: 'Steam',
  fetch: async (source, signal) => {
    const cfg = cfgOf(source)
    const appid = Number(cfg.appid ?? 730)
    const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=12&maxlength=300`
    const text = await fetchViaProxy(url, signal)
    const json = parseUpstream<{
      appnews?: { newsitems?: { gid: string; title: string; url: string; contents: string; date: number }[] }
    }>(text, 'Steam 新闻接口')
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
    // 缺 key 时报错而不是安静返回空：源卡片上要能直接看出是「少配了 key」，
    // 否则用户看到的是「抓取成功但 0 条」，会去怀疑网络
    if (!key) throw new Error('缺少 RAWG key：请在源配置里填 {"key":"你的 key"}')
    const date = new Date()
    const from = new Date(date.getFullYear(), date.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 10)
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&dates=${from},2099-12-31&ordering=-added&page_size=12`
    const text = await fetchViaProxy(url, signal)
    const json = parseUpstream<{
      results?: {
        id: number
        name: string
        background_image?: string
        released?: string
        platforms?: { platform: { name: string } }[]
        genres?: { name: string }[]
        slug: string
      }[]
    }>(text, 'RAWG 接口')
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
      if (!q.trim()) throw new Error('缺少搜索关键词：请在源配置里填 {"mode":"search","q":"关键词"}')
      url = `https://api.jikan.moe/v4/${type}?q=${encodeURIComponent(q)}&limit=12&order_by=score&sort=desc`
    } else if (mode === 'top') {
      url = `https://api.jikan.moe/v4/top/${type}?limit=12`
    } else {
      url = `https://api.jikan.moe/v4/seasons/now?filter=${type === 'manga' ? 'manga' : 'tv'}&limit=12`
    }
    // Jikan 对匿名调用限流很紧（3 次/秒、60 次/分钟），429 必须如实上报，
    // 否则用户只会看到「这个源不出数据了」
    const text = await fetchViaProxy(url, signal)
    const json = parseUpstream<{
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
    }>(text, 'Jikan 接口')
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
