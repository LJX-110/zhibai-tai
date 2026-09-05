/**
 * RSS Provider —— 真实数据（源驱动，url 取自 IntelligenceSource）
 * 浏览器端经 CORS 代理拉取 XML 解析。
 */
import { createId } from '../../../utils/id'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'

/**
 * 拉取策略：自建代理（设置里配置）→ 直连 → 公共 CORS 代理兜底。
 * 自建代理是治本方案（Cloudflare Worker，见仓库 cloudflare-worker/）——
 * 部署一次即拥有稳定的个人转发通道；
 * 直连对 RSSHub / GitHub API 等自带 CORS 头的源最快；
 * 公共代理 2026 现状：corsproxy.io 已强制 API Key（匿名一律 401，故移除）、
 * allorigins 间歇可用、cors.lol / cors.eu.org 限流（429 但活着）——
 * 多备几个、单个 8 秒快速失败，避免一个死代理拖死整条链。
 */
const FALLBACK_PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  (u: string) => `https://cors.eu.org/${u}`,
]

function proxyChain(): ((u: string) => string)[] {
  const chain: ((u: string) => string)[] = []
  const self = useSettingsStore.getState().corsProxyUrl?.trim()
  if (self) {
    const base = self.replace(/\/+$/, '')
    // 自建 Worker 的契约：GET <base>/?url=<encodeURIComponent(target)>
    chain.push((u) => `${base}/?url=${encodeURIComponent(u)}`)
  }
  chain.push((u) => u)
  return [...chain, ...FALLBACK_PROXIES]
}

const PROXY_TIMEOUT_MS = 8_000

export async function fetchViaProxy(url: string, signal?: AbortSignal): Promise<string> {
  let lastErr: unknown
  for (const proxy of proxyChain()) {
    const timeout = AbortSignal.timeout(PROXY_TIMEOUT_MS)
    const sig = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const res = await fetch(proxy(url), { signal: sig })
      if (res.ok) return await res.text()
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RSS 拉取失败（所有通道均不可达）')
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
