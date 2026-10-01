/**
 * 情报源注册表 —— 源驱动分发 + 默认源
 * fetchFromSource(source)：按 source.provider 分发到对应 Provider
 *
 * 这里**只做分发**：状态记录（lastFetchedAt / lastSuccessAt / lastError / failCount）、
 * 并发、退避、失败汇总都在 ../run。把状态写在这里会把「怎么抓」和
 * 「抓完记什么」耦在一起 —— 之前确实如此，于是三处调用点各写各的重试与落库逻辑，
 * 出现「手动抓取刷新了源状态、定时抓取却忘了刷新」这类不对称。
 */
import type { IntelligenceItem, IntelligenceProviderId, IntelligenceSource } from '../../../types/entities'
import { createId } from '../../../utils/id'
import { db } from '../../../db/db'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import { githubProvider } from './github'
import { rssProvider } from './rss'
import { customProvider } from './vertical'
import { jikanProvider, rawgProvider, steamProvider } from './extended'
import { bilibiliProvider } from './bilibili'
import { aiProvider } from './ai'
import { jsonProvider, webProvider } from './scraper'
import type { IntelligenceProvider } from './index'

/** Provider 实现映射（新 Provider 在此注册，不改 UI） */
export const PROVIDERS: Record<IntelligenceProviderId, IntelligenceProvider> = {
  github: githubProvider,
  rss: rssProvider,
  atom: rssProvider, // Atom 与 RSS 同解析
  json: jsonProvider,
  rest: jsonProvider, // REST JSON 同映射
  web: webProvider,
  custom: customProvider,
  steam: steamProvider,
  rawg: rawgProvider,
  jikan: jikanProvider,
  bilibili: bilibiliProvider,
  ai: aiProvider,
}

/**
 * 拉取单个源，**不写任何状态**（纯分发）。
 * 失败原样抛出，由调用方（run.ts）决定记录与提示方式。
 */
export async function fetchFromSource(
  source: IntelligenceSource,
  signal?: AbortSignal,
): Promise<IntelligenceItem[]> {
  const provider = PROVIDERS[source.provider]
  if (!provider) throw new Error(`未知 Provider：${source.provider}`)
  return provider.fetch(source, signal)
}

/** 首次启动的默认源 —— 按用户兴趣精选（**宁少勿杂**）。
 *
 *  Step 5-1 · C5 收口后的默认状态：**只有实测可靠的两个源默认启用**
 *  （GitHub 热榜 · 少数派，二者都自带 CORS、无需代理）。其余一律默认停用：
 *   · 候选源（`CANDIDATE_SOURCE_NAMES`）—— 实测不可靠，见那里；
 *   · 需自建转发端点的源（B 站 / 量子位 / IT之家）—— 没配代理前拉取必失败。
 *
 *  为什么不再"默认全部启用"：默认源是**开箱体验**，一条必然失败的红叉源会让人
 *  怀疑整个模块坏了（历史教训：静默停用又让人误以为功能缺失，两头都错）。
 *  现在的口径是：**默认可用的就必须真能用；不能保证可用的就别默认开**。
 *
 *  ⚠️ 抓取链路**不做公共代理兜底**（见 `proxy.ts` 文件头）——直连不行就快速失败
 *  并明确提示去配自建代理。 */
/** 机器之心 RSS 端点已下线（302 跳产品页）、战双帕弥什 B站路由无稳定数据源
 *  （rsshub.app 国内不通、镜像 503、公共代理间歇可用，2026-09 实测）——
 *  从默认源移除；老数据由 revive 迁移移除。
 *  AI 资讯可用「新增源」自行接入（如量子位 https://www.qbitai.com/feed）。 */
const RETIRED_DEFAULTS = [
  { name: 'AI 资讯 · 机器之心', url: 'https://www.jiqizhixin.com/rss' },
  // 播种时 URL 经 encodeURIComponent 存储，迁移匹配必须用同一形式
  {
    name: '战双帕弥什 · B站动态',
    url: `https://rsshub.app/bilibili/keyword/${encodeURIComponent('战双帕弥什')}`,
  },
]

/**
 * B 站默认源 —— 走 bilibili provider（前端签名 + 转发端点）。
 * 名字沿用历史的「· B站动态」，用户不必重新认识一遍。
 * B 站接口不放 CORS 头，所以这几个源**默认停用**：没配转发端点前拉取必失败，
 * 与其播种一堆红叉，不如让它们安安静静地等着被启用。
 */
const BILI_DEFAULT_SOURCES: { name: string; keyword: string; category: string }[] = [
  { name: '鸣潮 · B站动态', keyword: '鸣潮', category: '游戏' },
  { name: '网文圈 · B站动态', keyword: '网文', category: '小说' },
]

/**
 * 需要转发端点才能抓的中文源（实测可达但**不返回 CORS 头**，故默认停用）。
 * 实测（2026-09）：量子位 162ms、IT之家 107ms 均可直连到服务器，只是浏览器会被 CORS 拦。
 */
const PROXY_NEEDED_RSS: { name: string; url: string; category: string }[] = [
  { name: '量子位 · AI', url: 'https://www.qbitai.com/feed', category: 'AI' },
  { name: 'IT之家 · 科技', url: 'https://www.ithome.com/rss/', category: '科技' },
]

/**
 * **候选源**（Step 5-1 · C1）：实测不可靠、因此**默认停用**的源名。
 *
 * 判据不是"我觉得它不好"，而是实测：`api.jikan.moe/v4/seasons/now`（含应用实际使用的
 * `?filter=tv&limit=12`）在 2026-09-29 连续 4 次返回 **504**（上游过载）。
 * 默认启用它 = 新用户开箱第一眼就是一个**必然失败**的红叉源，且他没有任何可控的修复手段。
 *
 * ⚠️ provider **不删**：用户想用随时可在「情 · 源管理」里手动启用。
 * 见 `retireUnreliableDefaults()`（只对"从未成功抓取过"的存量降级）。
 */
const CANDIDATE_SOURCE_NAMES: ReadonlySet<string> = new Set(['日漫新番'])

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
  return [
    // —— 开箱即用（实测自带 CORS，无需任何配置、无需代理）——
    base({
      name: 'GitHub 热榜',
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
      name: '少数派',
      provider: 'rss',
      url: 'https://sspai.com/feed',
      category: '科技',
    }),
    // —— **候选源**：实测不可靠，默认停用（用户可自行启用）——
    base({
      name: '日漫新番',
      provider: 'jikan',
      category: '动漫',
      enabled: false,
      config: JSON.stringify({ mode: 'season', type: 'anime' }),
    }),
    // —— 需自建转发端点（默认停用，配好后一键启用）——
    ...BILI_DEFAULT_SOURCES.map((b) =>
      base({
        name: b.name,
        provider: 'bilibili',
        category: b.category,
        enabled: false,
        config: JSON.stringify({ keyword: b.keyword }),
      }),
    ),
    ...PROXY_NEEDED_RSS.map((r) =>
      base({
        name: r.name,
        provider: 'rss',
        url: r.url,
        category: r.category,
        enabled: false,
      }),
    ),
  ]
}

/**
 * 存量降级：把候选源（见 `CANDIDATE_SOURCE_NAMES`）关掉。
 *
 * 只动「**从未成功抓取过**」的那些（`lastSuccessAt` 为空）—— 用户若自己抓到过，
 * 说明它对他可用，不该被我们关掉；主动重新启用的也同理（`lastFetchedAt` 有值但没成功过
 * 的情况极少，此时宁可尊重现状不动）。
 *
 * @returns 被改写的源 id（Bootstrap 据此决定要不要刷新内存）
 */
export async function retireUnreliableDefaults(
  sources: readonly IntelligenceSource[],
): Promise<string[]> {
  const changed: string[] = []
  for (const s of sources) {
    if (!CANDIDATE_SOURCE_NAMES.has(s.name)) continue
    if (!s.enabled || s.lastSuccessAt || s.lastFetchedAt) continue
    await db.intelligenceSources.update(s.id, {
      enabled: false,
      updatedAt: new Date().toISOString(),
    })
    changed.push(s.id)
  }
  return changed
}

/**
 * 迁移用的「老默认源名 → B 站搜索关键词」映射。
 * 比播种清单全（含已不再播种的历史源），否则老用户手里那两个源会一直是坏地址。
 */
const LEGACY_BILI_KEYWORDS: Record<string, string> = {
  '鸣潮 · B站动态': '鸣潮',
  '国产单机 · B站动态': '国产单机游戏',
  '国漫 · B站动态': '国产动画',
  '网文圈 · B站动态': '网文',
}

/**
 * 迁移：老用户手里的 B 站源指向 `rsshub.app`（国内不可达），原样保留就是永久失败。
 * 就地改写为 bilibili provider（前端签名 + 转发端点），源名与分类不变 —— 不需要删掉重建。
 * 用户自行改成别的地址的 RSS 源不在匹配范围内，不动。
 *
 * 改写成停用还是启用，取决于用户**是否已配置转发端点**：
 * 没配就停用（免得播种一堆必然失败的红叉），配了就保持可用。
 * @returns 被改写的源 id
 */
export async function migrateBilibiliSources(
  sources: IntelligenceSource[],
): Promise<string[]> {
  const hasProxy = Boolean(useSettingsStore.getState().corsProxyUrl?.trim())
  const changed: string[] = []
  for (const s of sources) {
    if (s.provider !== 'rss') continue
    if (!s.url?.includes('rsshub')) continue
    const keyword = LEGACY_BILI_KEYWORDS[s.name]
    if (!keyword) continue
    await db.intelligenceSources.update(s.id, {
      provider: 'bilibili',
      url: undefined,
      config: JSON.stringify({ keyword }),
      enabled: hasProxy,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    })
    changed.push(s.id)
  }
  return changed
}

/** 修复迁移：
 *  1) 早期将 B站默认源播种为停用，老数据里它们仍是 enabled:false ——
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
    // 只有「本来就该启用」的默认源才补启用。
    // 新版本故意播种了一批停用的源（需自建代理 / B站），不加这个判断会把它们又打开，
    // 于是用户看到一排必然失败的红叉。
    const isDefault = defaults.some((d) => d.name === s.name && d.url === s.url && d.enabled)
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
