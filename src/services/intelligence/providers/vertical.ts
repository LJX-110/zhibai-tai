/**
 * 垂直领域 Provider —— 用户自定义源（RSS / Atom / JSON feed）
 * 用户提供 url，按 RSS/Atom 解析，可工作。
 */
import { fetchViaProxy, parseFeed, rssEntriesToItems } from './rss'
import type { IntelligenceProvider } from './index'

/** 自定义源：用户提供 url，先按 RSS/Atom 解析，不是 feed 再按 JSON feed 解析 */
export const customProvider: IntelligenceProvider = {
  id: 'custom',
  name: '自定义',
  fetch: async (source, signal) => {
    if (!source.url) return []
    const text = await fetchViaProxy(source.url, signal)
    const entries = parseFeed(text)
    if (entries.length > 0) {
      return rssEntriesToItems(entries.slice(0, 12), source)
    }
    let arr: Record<string, unknown>[]
    try {
      const json = JSON.parse(text) as Record<string, unknown>
      arr = (Array.isArray(json.items) ? json.items : (json.entries ?? [])) as Record<string, unknown>[]
    } catch {
      // 两种格式都不像：此前这里静默返回空数组，源会长期显示「成功但 0 条」，
      // 用户无从判断是地址错了还是解析没覆盖 —— 抛出去让源卡片显示真实原因
      throw new Error('parse: 既不是 RSS/Atom，也不是 JSON feed（检查地址是否指向 feed）')
    }
    if (arr.length === 0) {
      throw new Error('empty: JSON feed 里没有 items/entries')
    }
    return rssEntriesToItems(
      arr.map((it) => ({
        title: String(it.title ?? ''),
        link: String(it.link ?? ''),
        description: String(it.content_text ?? it.summary ?? ''),
        pubDate: String(it.date_published ?? it.published ?? ''),
      })),
      source,
    )
  },
}
