/**
 * 自定义情报源 Provider —— Web(CSS 选择器) / JSON / REST
 * 原则：客户端 Fetch（受 CORS 限制）+ 代理尝试；不硬解 CORS
 * 配置均为 JSON 字符串，字段名见下方注释
 * 失败分类见 ../errors（`empty:` / `parse:` / `config:` 前缀即由那边识别）
 */
import { createId } from '../../../utils/id'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import { toIsoDate, type IntelligenceProvider } from './index'
import { fetchViaProxy } from './rss'

/**
 * 拉取文本。
 *
 * 这里**不再自己加一层超时**：超时是 ./proxy 的职责，它按候选通道分别计时
 * （自建代理根路径 → /proxy，各 8 秒）。此前这里另套一个 12 秒的外层定时器，
 * 结果是第一个候选超时后用掉 8 秒，第二个候选跑到 4 秒就被外层掐断 ——
 * 「先试 /?url= 再试 /proxy?url=」的双通道退路形同虚设。
 */
async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
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

/** 解析选择器配置（缺省用 fallback；**写了但不合法就报错**，不静默当没写） */
function parseConfig<T>(source: IntelligenceSource, fallback: T): T {
  if (!source.config) return fallback
  try {
    return { ...fallback, ...(JSON.parse(source.config) as Partial<T>) }
  } catch {
    throw new Error('config: 源配置不是合法 JSON（检查 config 字段）')
  }
}

const pickText = (root: Element | Document, sel?: string): string | undefined => {
  if (!sel) return undefined
  return root.querySelector(sel)?.textContent?.trim() || undefined
}

/** 页面里的相对地址按源站解析；解析不了就保留原值（总比丢掉可用） */
function absoluteUrl(raw: string | null | undefined, base: string): string | undefined {
  const v = raw?.trim()
  if (!v) return undefined
  try {
    return new URL(v, base).href
  } catch {
    return v
  }
}

/** 取元素属性（链接/图片要的是 href/src，不是文字） */
function pickAttr(
  root: Element,
  sel: string | undefined,
  attr: 'href' | 'src',
): string | undefined {
  const el = sel ? root.querySelector(sel) : null
  const value = el?.getAttribute(attr) ?? el?.getAttribute(`data-${attr}`)
  return value?.trim() || undefined
}

/** Web Provider：抓取 HTML 并用 CSS 选择器抽取列表 */
export const webProvider: IntelligenceProvider = {
  id: 'web',
  name: 'Web',
  fetch: async (source, signal) => {
    if (!source.url) throw new Error('config: 该来源需要抓取地址（url）')
    const pageUrl = source.url
    const html = await fetchText(pageUrl, signal)
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
      // linkSel 选中的是 <a>，值在 href 上；取 textContent 会得到标题文字而不是地址
      const rawLink =
        pickAttr(n, cfg.linkSel, 'href') ?? n.querySelector('a')?.getAttribute('href')?.trim()
      const rawImage =
        pickAttr(n, cfg.imageSel, 'src') ??
        n.querySelector('img')?.getAttribute('src')?.trim() ??
        n.querySelector('img')?.getAttribute('data-src')?.trim()
      const rawTime =
        n.querySelector(cfg.timeSel ?? 'time')?.getAttribute('datetime') ??
        pickText(n, cfg.timeSel)
      return {
        id: createId(),
        title: pickText(n, cfg.titleSel) ?? n.querySelector('a')?.textContent?.trim() ?? '（无标题）',
        source: source.name,
        sourceName: source.name,
        sourceType: 'web',
        category: source.category,
        tags: [source.category],
        url: absoluteUrl(rawLink, pageUrl),
        summary: pickText(n, cfg.summarySel)?.slice(0, 200),
        image: absoluteUrl(rawImage, pageUrl)?.slice(0, 300),
        author: pickText(n, cfg.authorSel),
        publishedAt: toIsoDate(rawTime),
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
    if (!source.url) throw new Error('config: 该来源需要抓取地址（url）')
    const endpoint = source.url
    const text = await fetchText(endpoint, signal)
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
      const rawUrl = cfg.urlKey ? String(it[cfg.urlKey] ?? '') || undefined : undefined
      const rawImage = cfg.imageKey ? String(it[cfg.imageKey] ?? '') || undefined : undefined
      return {
        id: createId(),
        title: String(it[cfg.titleKey] ?? '（无标题）'),
        source: source.name,
        sourceName: source.name,
        sourceType: 'web',
        category: source.category,
        tags: [source.category],
        url: absoluteUrl(rawUrl, endpoint),
        summary: cfg.summaryKey ? String(it[cfg.summaryKey] ?? '').slice(0, 200) || undefined : undefined,
        image: absoluteUrl(rawImage, endpoint),
        author: cfg.authorKey ? String(it[cfg.authorKey] ?? '') || undefined : undefined,
        publishedAt: toIsoDate(dateRaw),
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
