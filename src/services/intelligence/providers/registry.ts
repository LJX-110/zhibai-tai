/**
 * 情报源注册表 —— 源驱动分发 + 默认源
 * fetchFromSource(source)：按 source.provider 分发到对应 Provider
 * fetchAllFromSources(sources)：拉取全部启用源
 */
import type { IntelligenceItem, IntelligenceProviderId, IntelligenceSource } from '../../../types/entities'
import { createId } from '../../../utils/id'
import { db } from '../../../db/db'
import { mockProvider } from './mock'
import { githubProvider } from './github'
import { rssProvider } from './rss'
import { animeProvider, customProvider, gameProvider, officialProvider } from './vertical'
import { jikanProvider, rawgProvider, steamProvider } from './extended'
import { jsonProvider, webProvider } from './scraper'
import type { IntelligenceProvider } from './index'

/** Provider 实现映射（新 Provider 在此注册，不改 UI） */
export const PROVIDERS: Record<IntelligenceProviderId, IntelligenceProvider> = {
  mock: mockProvider,
  github: githubProvider,
  rss: rssProvider,
  atom: rssProvider, // Atom 与 RSS 同解析
  json: jsonProvider,
  rest: jsonProvider, // REST JSON 同映射
  game: gameProvider,
  anime: animeProvider,
  official: officialProvider,
  web: webProvider,
  custom: customProvider,
  steam: steamProvider,
  rawg: rawgProvider,
  jikan: jikanProvider,
}

/** 推荐来源目录（本地 Provider Catalog，点击即预填配置）—— 精选 8 个 */
export const PROVIDER_CATALOG: {
  provider: IntelligenceProviderId
  name: string
  desc: string
  category: string
  config?: string
}[] = [
  { provider: 'github', name: 'GitHub 热榜', desc: '按搜索词拉取热门仓库', category: 'GitHub' },
  { provider: 'rss', name: 'RSS 源', desc: '任意 RSS/Atom 订阅', category: '科技' },
  { provider: 'jikan', name: 'Jikan 新番', desc: 'MyAnimeList 当季新番/评分榜（无需 Key）', category: '动漫' },
  { provider: 'jikan', name: 'Jikan 漫画', desc: 'MyAnimeList 漫画榜', category: '动漫' },
  { provider: 'steam', name: 'Steam 新闻', desc: '按 App ID 获取游戏新闻/更新/公告', category: '游戏' },
  { provider: 'web', name: '网页抓取', desc: 'CSS 选择器抽取标题/摘要/链接', category: '自定义' },
  { provider: 'json', name: 'JSON Feed', desc: 'RSS JSON 或自定义 JSON 数组', category: '自定义' },
  { provider: 'mock', name: '示例情报', desc: '离线示例数据', category: '科技' },
]

/** 拉取单个源（记录 lastFetchedAt / lastError；失败向上抛出，由调用方决定提示方式） */
export async function fetchFromSource(
  source: IntelligenceSource,
  signal?: AbortSignal,
): Promise<IntelligenceItem[]> {
  const provider = PROVIDERS[source.provider]
  if (!provider) throw new Error('未知 Provider')
  const now = new Date().toISOString()
  try {
    const items = await provider.fetch(source, signal)
    await db.intelligenceSources.update(source.id, { lastFetchedAt: now, lastError: undefined })
    return items
  } catch (e) {
    await db.intelligenceSources.update(source.id, {
      lastFetchedAt: now,
      lastError: e instanceof Error ? e.message : '拉取失败',
    })
    console.warn(`[intel:${source.provider}] ${source.name} 拉取失败`, e)
    throw e
  }
}

/** 测试单源：保留错误并抛出（供「测试→预览」使用，便于错误分类） */
export async function testSource(
  source: IntelligenceSource,
  signal?: AbortSignal,
): Promise<IntelligenceItem[]> {
  const provider = PROVIDERS[source.provider]
  if (!provider) throw new Error('未知 Provider')
  const now = new Date().toISOString()
  try {
    const items = await provider.fetch(source, signal)
    await db.intelligenceSources.update(source.id, { lastFetchedAt: now, lastError: undefined })
    return items
  } catch (e) {
    await db.intelligenceSources.update(source.id, {
      lastFetchedAt: now,
      lastError: e instanceof Error ? e.message : '拉取失败',
    })
    throw e
  }
}

/** 拉取全部启用源 */
export async function fetchAllFromSources(
  sources: IntelligenceSource[],
  signal?: AbortSignal,
): Promise<IntelligenceItem[]> {
  const enabled = sources.filter((s) => s.enabled)
  const results = await Promise.allSettled(enabled.map((s) => fetchFromSource(s, signal)))
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/** 首次启动的默认源 —— 按用户兴趣精选（宁少勿杂）。
 *  兴趣类（鸣潮/战双/国产单机/国漫/网文）走 RSSHub 的 B站关键词路由。
 *  曾默认停用这些源（担心 rsshub.app 公共实例限流），但「静默停用」让用户
 *  误以为功能坏了——现默认全部启用：抓取失败会在源卡片上显示 lastError，
 *  由用户自行决定换镜像或删除；抓取链路本身直连+多代理兜底（见 rss.ts）。 */
/** 机器之心 RSS 端点已下线（302 跳产品页），从默认源移除；老数据由 revive 移除。
 *  AI 资讯可用「新增源」自行接入（如量子位 https://www.qbitai.com/feed）。 */
const RETIRED_DEFAULTS = [
  { name: 'AI 资讯 · 机器之心', url: 'https://www.jiqizhixin.com/rss' },
]

export function defaultSources(): IntelligenceSource[] {
  const now = new Date().toISOString()
  const base = (p: Partial<IntelligenceSource> & { name: string; provider: IntelligenceProviderId; category: string }): IntelligenceSource => ({
    id: createId(),
    url: undefined,
    config: undefined,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...p,
  })
  const rsshubBiliKeyword = (kw: string) =>
    `https://rsshub.app/bilibili/keyword/${encodeURIComponent(kw)}`
  return [
    base({
      name: 'GitHub 实用项目',
      provider: 'github',
      category: 'GitHub',
      config: JSON.stringify({
        queries: [
          'topic:ai-tools+stars:>500',
          'topic:self-hosted+stars:>500',
          'topic:productivity+stars:>300',
        ],
      }),
    }),
    base({
      name: '日漫新番',
      provider: 'jikan',
      category: '动漫',
      config: JSON.stringify({ mode: 'season', type: 'anime' }),
    }),
    base({
      name: '鸣潮 · B站动态',
      provider: 'rss',
      category: '游戏',
      url: rsshubBiliKeyword('鸣潮'),
    }),
    base({
      name: '战双帕弥什 · B站动态',
      provider: 'rss',
      category: '游戏',
      url: rsshubBiliKeyword('战双帕弥什'),
    }),
    base({
      name: '国产单机 · B站动态',
      provider: 'rss',
      category: '游戏',
      url: rsshubBiliKeyword('国产单机游戏'),
    }),
    base({
      name: '国漫 · B站动态',
      provider: 'rss',
      category: '动漫',
      url: rsshubBiliKeyword('国产动画'),
    }),
    base({
      name: '网文圈 · B站动态',
      provider: 'rss',
      category: '小说',
      url: rsshubBiliKeyword('网文'),
    }),
  ]
}

/** 修复迁移：
 *  1) v0.3 将 B站默认源播种为停用，老数据里它们仍是 enabled:false ——
 *     只补「从未成功抓取过」的源（lastFetchedAt 为空说明用户没在用），
 *     用户主动停用且用过的源不动。
 *  2) 机器之心官方 RSS 已下线，仍指向死地址的默认源直接移除（走墓碑）；
 *     用户改过 URL 的说明已自行换源，保留。
 *  @returns 需要从内存与库中移除的源 id */
export async function reviveDisabledDefaults(
  sources: IntelligenceSource[],
): Promise<{ revived: string[]; removed: string[] }> {
  const defaults = defaultSources()
  const revived: string[] = []
  const removed: string[] = []
  for (const s of sources) {
    const retired = RETIRED_DEFAULTS.some((r) => r.name === s.name && r.url === s.url)
    if (retired) {
      removed.push(s.id)
      continue
    }
    if (s.enabled) continue
    const isDefault = defaults.some((d) => d.name === s.name && d.url === s.url)
    if (!isDefault || s.lastFetchedAt) continue
    await db.intelligenceSources.update(s.id, { enabled: true, updatedAt: new Date().toISOString() })
    revived.push(s.id)
  }
  return { revived, removed }
}

/** 按 name 去重：保留「启用且最早」的一条，返回应删除的 id（修复重复播种） */
export function duplicateSourceIds(sources: IntelligenceSource[]): string[] {
  const best = new Map<string, IntelligenceSource>()
  for (const s of sources) {
    const cur = best.get(s.name)
    if (!cur) {
      best.set(s.name, s)
      continue
    }
    const keepCur = cur.enabled !== s.enabled ? cur.enabled : cur.createdAt <= s.createdAt
    if (keepCur) continue
    best.set(s.name, s)
  }
  const keep = new Set([...best.values()].map((s) => s.id))
  return sources.filter((s) => !keep.has(s.id)).map((s) => s.id)
}
