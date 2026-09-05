/**
 * 自定义情报源 Provider —— Web(CSS 选择器) / JSON / REST
 * 原则：客户端 Fetch（受 CORS 限制）+ 代理尝试；不硬解 CORS；错误分类清晰
 * 配置均为 JSON 字符串，字段名见下方注释
 */
import { createId } from '../../../utils/id'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'
import { fetchViaProxy } from './rss'

/* ---------------- 错误分类 ---------------- */

export type FetchErrorKind = 'cors' | 'auth' | 'timeout' | 'parse' | 'empty' | 'http' | 'network'

export interface FetchErrorInfo {
  kind: FetchErrorKind
  message: string
}

export function classifyFetchError(e: unknown): FetchErrorInfo {
  const msg = e instanceof Error ? e.message : String(e)
  const m = msg.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('cors')) {
    return { kind: 'cors', message: 'CORS 或网络受限：浏览器无法直接访问该源。建议改用 RSS/JSON 接口，或后续接入服务端代理。' }
  }
  if (m.includes('401') || m.includes('403') || m.includes('unauthorized') || m.includes('forbidden')) {
    return { kind: 'auth', message: '认证失败：可能需要 API Key 或登录态。' }
  }
  if (m.includes('abort') || m.includes('timeout')) {
    return { kind: 'timeout', message: '请求超时或被取消。' }
  }
  if (m.includes('parse') || m.includes('json') || m.includes('xml')) {
    return { kind: 'parse', message: '解析失败：内容格式与所选 Provider 不符。' }
  }
  if (m.startsWith('http ')) {
    return { kind: 'http', message: `HTTP 错误：${msg}` }
  }
  return { kind: 'network', message: msg }
}

/** 带超时与取消的拉取 */
export async function fetchText(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 12000,
): Promise<string> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetchViaProxy(url, ctrl.signal)
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/* ---------------- Web（CSS 选择器） ---------------- */

export interface WebScrapeConfig {
  /** 列表容器选择器（可选，限定候选条目） */
  listSel?: string
  /** 候选条目选择器（必填） */
  itemSel: string
  titleSel?: string
  linkSel?: string
  summarySel?: string
  imageSel?: string
  timeSel?: string
  authorSel?: string
}

/** 解析选择器配置（含容错） */
function parseConfig<T>(source: IntelligenceSource, fallback: T): T {
  if (!source.config) return fallback
  try {
    return { ...fallback, ...(JSON.parse(source.config) as Partial<T>) }
  } catch {
    return fallback
  }
}

const pickText = (root: Element | Document, sel?: string): string | undefined => {
  if (!sel) return undefined
  return root.querySelector(sel)?.textContent?.trim() || undefined
}

/** Web Provider：抓取 HTML 并用 CSS 选择器抽取列表 */
export const webProvider: IntelligenceProvider = {
  id: 'web',
  name: 'Web',
  fetch: async (source, signal) => {
    if (!source.url) return []
    const html = await fetchText(source.url, signal)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const cfg = parseConfig<WebScrapeConfig>(source, {
      itemSel: 'article, .item, .post, li',
    })
    const scope = cfg.listSel ? (doc.querySelector(cfg.listSel) ?? doc) : doc
    const nodes = Array.from(scope.querySelectorAll(cfg.itemSel)).slice(0, 12)
    if (nodes.length === 0) {
      throw new Error('parse: 未匹配到任何条目（itemSel 选择器无效）')
    }
    const now = new Date().toISOString()
    const items: IntelligenceItem[] = nodes.map((n) => {
      const link = pickText(n, cfg.linkSel) || n.querySelector('a')?.getAttribute('href')
      return {
        id: createId(),
        title: pickText(n, cfg.titleSel) ?? n.querySelector('a')?.textContent?.trim() ?? '（无标题）',
        source: source.name,
        sourceName: source.name,
        sourceType: 'web',
        category: source.category,
        tags: [source.category],
        url: link ?? undefined,
        summary: pickText(n, cfg.summarySel)?.slice(0, 200),
        image: pickText(n, cfg.imageSel)?.slice(0, 300) ?? n.querySelector('img')?.getAttribute('src') ?? undefined,
        author: pickText(n, cfg.authorSel),
        publishedAt: undefined,
        read: false,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        convertedToNoteId: null,
        convertedToTaskId: null,
      }
    })
    return items
  },
}

/* ---------------- JSON / REST ---------------- */

export interface JsonScrapeConfig {
  /** JSON 数组路径，如 "items" 或 "data.list"（按 . 分隔） */
  listPath?: string
  titleKey: string
  urlKey?: string
  summaryKey?: string
  dateKey?: string
  imageKey?: string
  authorKey?: string
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc == null) return undefined
    return (acc as Record<string, unknown>)[k]
  }, obj)
}

/** JSON / REST Provider：拉取 JSON，按字段映射为条目 */
export const jsonProvider: IntelligenceProvider = {
  id: 'json',
  name: 'JSON',
  fetch: async (source, signal) => {
    if (!source.url) return []
    const text = await fetchText(source.url, signal)
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('parse: 不是合法 JSON（试试 RSS/Web Provider）')
    }
    const cfg = parseConfig<JsonScrapeConfig>(source, { titleKey: 'title' })
    const arrRaw = cfg.listPath ? getByPath(data, cfg.listPath) : data
    const arr = Array.isArray(arrRaw) ? (arrRaw as Record<string, unknown>[]) : null
    if (!arr || arr.length === 0) {
      throw new Error('empty: JSON 中没有可映射的数组（检查 listPath）')
    }
    const now = new Date().toISOString()
    const items: IntelligenceItem[] = arr.slice(0, 12).map((it) => {
      const dateRaw = it[cfg.dateKey ?? ''] ?? it['date'] ?? it['published_at'] ?? ''
      return {
        id: createId(),
        title: String(it[cfg.titleKey] ?? '（无标题）'),
        source: source.name,
        sourceName: source.name,
        sourceType: 'web',
        category: source.category,
        tags: [source.category],
        url: cfg.urlKey ? String(it[cfg.urlKey] ?? '') || undefined : undefined,
        summary: cfg.summaryKey ? String(it[cfg.summaryKey] ?? '').slice(0, 200) || undefined : undefined,
        image: cfg.imageKey ? String(it[cfg.imageKey] ?? '') || undefined : undefined,
        author: cfg.authorKey ? String(it[cfg.authorKey] ?? '') || undefined : undefined,
        publishedAt: dateRaw ? new Date(String(dateRaw)).toISOString() : undefined,
        read: false,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        convertedToNoteId: null,
        convertedToTaskId: null,
      }
    })
    return items
  },
}
