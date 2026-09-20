/**
 * RSS Provider —— 真实数据（源驱动，url 取自 IntelligenceSource）
 * 浏览器端经转发通道拉取 XML 并解析。
 */
import { createId } from '../../../utils/id'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'
import { proxyFetch } from './proxy'

/**
 * 拉取入口 —— 通道选择与失败语义都在 ./proxy 里（B 站 provider 共用同一条）。
 * 这里只负责把设置里的自建代理地址取出来，保持 provider 侧调用形态不变。
 */
export async function fetchViaProxy(url: string, signal?: AbortSignal): Promise<string> {
  return proxyFetch(url, useSettingsStore.getState().corsProxyUrl, signal)
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
    // 解析出 0 条不能算「成功但没有更新」：站点被 CDN 换成验证页、地址失效后
    // 跳转到首页、返回空 body，都会走到这里。静默返回空数组会让源看起来「正常」，
    // 而用户永远等不到新情报 —— 必须显式失败，才能在源卡片上说清是哪一步坏掉的
    if (entries.length === 0) {
      throw new Error('parse: 内容里没有 RSS/Atom 条目（地址可能已失效，或返回的是网页/错误页）')
    }
    return rssEntriesToItems(entries.slice(0, 12), source)
  },
}
