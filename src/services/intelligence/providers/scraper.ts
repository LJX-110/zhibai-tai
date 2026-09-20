/**
 * 自定义情报源 Provider —— Web(CSS 选择器) / JSON / REST
 * 原则：客户端 Fetch（受 CORS 限制）+ 代理尝试；不硬解 CORS
 * 配置均为 JSON 字符串，字段名见下方注释
 * 失败分类见 ../errors（`empty:` / `parse:` 前缀即由那边识别）
 */
import { createId } from '../../../utils/id'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'
import { fetchViaProxy } from './rss'

/**
 * 拉取文本。
 *
 * 这里**不再自己加一层超时**：超时是 ./proxy 的职责，它按候选通道分别计时
 * （自建代理根路径 → /proxy，各 8 秒）。此前这里另套一个 12 秒的外层定时器，
 * 结果是第一个候选超时后用掉 8 秒，第二个候选跑到 4 秒就被外层掐断 ——
 * 「先试 /?url= 再试 /proxy?url=」的双通道退路形同虚设。
 */
export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  return fetchViaProxy(url, signal)
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
