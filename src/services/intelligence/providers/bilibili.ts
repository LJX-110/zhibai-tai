/**
 * B 站 Provider —— 前端签名 + 转发端点
 *
 * 两个障碍与各自的解法：
 *  1. **CORS**：B 站接口不返回 `Access-Control-Allow-Origin`，浏览器直连必被拦。
 *     → 交给转发端点（实测 `api.bilibili.com` 本身只要 97ms，网络没问题）。
 *  2. **WBI 签名**：搜索接口要求对查询串求 md5，而 Web Crypto 不提供 md5。
 *     → 自带一份 ASCII 版 MD5（见 ./wbi）在前端算，**不再要求服务端实现签名**。
 *
 * 为什么坚持把签名放前端：签名一旦落在服务端，用户就被绑死在某个云服务的运行时上
 * （上一版要求部署到 `*.workers.dev`，而该域在国内被 DNS 污染，部署了也连不上）。
 * 签名移到前端后，转发端点可以换成任何国内可达的形态，甚至换成本机小代理。
 *
 * 历史遗留：默认源曾指向 `https://rsshub.app/bilibili/keyword/*`，
 * 而 rsshub.app 在国内不可达、公共 CORS 代理也全部不可达 —— 那是路线错误，不是配置问题。
 */
import { createId } from '../../../utils/id'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import { keyFromUrl, signedQuery, type WbiKeys } from '../wbi'
import { NEEDS_PROXY_MESSAGE, proxyFetch } from './proxy'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'

const SEARCH_ENDPOINT = 'https://api.bilibili.com/x/web-interface/wbi/search/type'
const NAV_ENDPOINT = 'https://api.bilibili.com/x/web-interface/nav'

interface BiliConfig {
  /** 搜索关键词（如：鸣潮 / 网文） */
  keyword?: string
  /** 排序：pubdate 最新 / click 播放 / dm 弹幕 / stow 收藏 */
  order?: string
  /** 条数（默认 12，上限 30） */
  limit?: number
}

function cfgOf(source: IntelligenceSource): BiliConfig {
  if (!source.config) return {}
  try {
    return JSON.parse(source.config) as BiliConfig
  } catch {
    return {}
  }
}

/** 上游被风控拦截时会返回 HTML 错误页，直接 JSON.parse 抛出的
 *  "Unexpected token '<'" 完全看不出问题，这里换成能对症的提示 */
function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${label}返回非 JSON（可能被风控拦截）`)
  }
}

/** wbi 密钥每天轮换，模块内缓存半小时，省掉一次转发请求 */
let keyCache: { at: number; keys: WbiKeys } | null = null
const KEY_TTL_MS = 30 * 60 * 1000

async function loadWbiKeys(proxyUrl: string, signal?: AbortSignal): Promise<WbiKeys> {
  if (keyCache && Date.now() - keyCache.at < KEY_TTL_MS) return keyCache.keys
  const text = await proxyFetch(NAV_ENDPOINT, proxyUrl, signal)
  const body = parseJson<{ data?: { wbi_img?: { img_url?: string; sub_url?: string } } }>(
    text,
    'B 站 nav 接口',
  )
  const imgKey = keyFromUrl(body?.data?.wbi_img?.img_url ?? '')
  const subKey = keyFromUrl(body?.data?.wbi_img?.sub_url ?? '')
  if (!imgKey || !subKey) throw new Error('取不到 B 站 WBI 密钥（nav 接口异常）')
  const keys = { imgKey, subKey }
  keyCache = { at: Date.now(), keys }
  return keys
}

/* ---------- 归一化：B 站字段 → 前端统一情报模型 ---------- */

function stripHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function toIso(seconds: unknown): string | undefined {
  const n = Number(seconds)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000).toISOString()
}

interface BiliSearchItem {
  bvid?: string
  aid?: number
  title?: string
  description?: string
  pic?: string
  author?: string
  pubdate?: number
}

function toItem(raw: BiliSearchItem, source: IntelligenceSource, now: string): IntelligenceItem {
  const pic = String(raw.pic ?? '')
  return {
    id: createId(),
    title: stripHtml(raw.title) || '（无标题）',
    source: source.name,
    sourceName: source.name,
    sourceType: 'bilibili',
    externalId: raw.bvid ?? (raw.aid != null ? String(raw.aid) : undefined),
    category: source.category,
    tags: [source.category, stripHtml(raw.author)].filter((t) => Boolean(t)),
    url: raw.bvid ? `https://www.bilibili.com/video/${raw.bvid}` : undefined,
    image: pic ? (pic.startsWith('//') ? `https:${pic}` : pic) : undefined,
    summary: stripHtml(raw.description).slice(0, 200) || undefined,
    author: stripHtml(raw.author) || undefined,
    publishedAt: toIso(raw.pubdate),
    read: false,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    convertedToNoteId: null,
    convertedToTaskId: null,
  }
}

export const bilibiliProvider: IntelligenceProvider = {
  id: 'bilibili',
  name: 'B 站',
  fetch: async (source, signal) => {
    const cfg = cfgOf(source)
    const keyword = (cfg.keyword ?? '').trim()
    if (!keyword) return []

    const proxyUrl = useSettingsStore.getState().corsProxyUrl?.trim()
    if (!proxyUrl) throw new Error(NEEDS_PROXY_MESSAGE)

    const keys = await loadWbiKeys(proxyUrl, signal)
    const query = signedQuery(
      {
        search_type: 'video',
        keyword,
        page: '1',
        page_size: String(Math.min(Math.max(Number(cfg.limit) || 12, 1), 30)),
        order: cfg.order ?? 'pubdate',
      },
      keys,
    )
    const text = await proxyFetch(`${SEARCH_ENDPOINT}?${query}`, proxyUrl, signal)
    const body = parseJson<{
      code?: number
      message?: string
      data?: { result?: BiliSearchItem[] }
    }>(text, 'B 站搜索接口')
    if (body?.code !== 0) {
      throw new Error(`B 站返回 ${body?.code}：${body?.message ?? '未知错误'}`)
    }
    const now = new Date().toISOString()
    return (body?.data?.result ?? []).map((it) => toItem(it, source, now))
  },
}
