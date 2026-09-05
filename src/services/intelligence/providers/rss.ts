/**
 * RSS Provider —— 真实数据（源驱动，url 取自 IntelligenceSource）
 * 浏览器端经 CORS 代理拉取 XML 解析。
 */
import { createId } from '../../../utils/id'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'

/** 常见 CORS 代理（按顺序尝试） */
const PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
]

export async function fetchViaProxy(url: string, signal?: AbortSignal): Promise<string> {
  let lastErr: unknown
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal })
      if (res.ok) return await res.text()
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RSS 拉取失败')
}

/** 解析 RSS/Atom XML → 条目 */
export function parseFeed(xml: string): { title?: string; link?: string; description?: string; pubDate?: string }[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const nodes = Array.from(doc.querySelectorAll('item, entry'))
  return nodes.map((n) => ({
    title: n.querySelector('title')?.textContent?.trim() ?? '（无标题）',
    link: n.querySelector('link')?.getAttribute('href') ?? n.querySelector('link')?.textContent?.trim(),
    description: n.querySelector('description')?.textContent?.trim()?.slice(0, 200),
    pubDate:
      n.querySelector('pubDate')?.textContent?.trim() ??
      n.querySelector('published')?.textContent?.trim(),
  }))
}

/** 把 RSS 条目转换为统一模型 */
export function rssEntriesToItems(
  entries: { title?: string; link?: string; description?: string; pubDate?: string }[],
  source: IntelligenceSource,
): IntelligenceItem[] {
  const now = new Date().toISOString()
  return entries.map((e) => ({
    id: createId(),
    title: e.title ?? '（无标题）',
    source: source.name,
    sourceName: source.name,
    sourceType: 'rss',
    category: source.category,
    tags: [source.category],
    url: e.link,
    summary: e.description,
    publishedAt: e.pubDate ? new Date(e.pubDate).toISOString() : undefined,
    read: false,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    convertedToNoteId: null,
    convertedToTaskId: null,
  }))
}

export const rssProvider: IntelligenceProvider = {
  id: 'rss',
  name: 'RSS',
  fetch: async (source, signal) => {
    if (!source.url) return []
    const xml = await fetchViaProxy(source.url, signal)
    const entries = parseFeed(xml)
    return rssEntriesToItems(entries.slice(0, 12), source)
  },
}
