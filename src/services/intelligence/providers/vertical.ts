/**
 * 垂直领域 Provider —— 游戏 / 动漫 / 官方 / Web / 自定义
 * 第一版留接口；Custom 已可工作（按 RSS/JSON feed 解析用户提供的 url）
 */
import { fetchViaProxy, parseFeed, rssEntriesToItems } from './rss'
import type { IntelligenceProvider } from './index'

/** 游戏情报（Steam / RAWG 未来接入；类别：新品/更新/公告/发售/折扣/开发日志） */
export const gameProvider: IntelligenceProvider = {
  id: 'game',
  name: '游戏',
  fetch: async () => {
    console.info('[intel:game] Steam/RAWG API 待接入')
    return []
  },
}

/** 动漫情报（新番/完结/动画/漫画/角色 未来接入） */
export const animeProvider: IntelligenceProvider = {
  id: 'anime',
  name: '动漫',
  fetch: async () => {
    console.info('[intel:anime] Anime API 待接入')
    return []
  },
}

/** 官方公告（project/产品的 official API 未来接入） */
export const officialProvider: IntelligenceProvider = {
  id: 'official',
  name: '官方',
  fetch: async () => {
    console.info('[intel:official] 官方源待配置')
    return []
  },
}

/** 自定义源：用户提供 url，按 RSS/Atom 解析（可工作） */
export const customProvider: IntelligenceProvider = {
  id: 'custom',
  name: '自定义',
  fetch: async (source, signal) => {
    if (!source.url) return []
    const text = await fetchViaProxy(source.url, signal)
    // 优先按 RSS/XML 解析；若解析无结果且为 JSON，尝试 JSON feed
    const entries = parseFeed(text)
    if (entries.length > 0) {
      return rssEntriesToItems(entries.slice(0, 12), source)
    }
    try {
      const json = JSON.parse(text) as Record<string, unknown>
      const arr = (Array.isArray(json.items) ? json.items : json.entries ?? []) as Record<string, unknown>[]
      return rssEntriesToItems(
        arr.map((it) => ({
          title: String(it.title ?? ''),
          link: String(it.link ?? ''),
          description: String(it.content_text ?? it.summary ?? ''),
          pubDate: String(it.date_published ?? it.published ?? ''),
        })),
        source,
      )
    } catch {
      return []
    }
  },
}
