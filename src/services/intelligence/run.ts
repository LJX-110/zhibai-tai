/**
 * 抓取编排 —— 情报抓取的唯一入口
 *
 * 为什么要把「怎么抓」收拢到这里：
 *  此前情报页 / 命令面板 / 定时器三处各自 `fetchAllFromSources` + 去重 + 落库，
 *  于是并发、退避、状态记录这三件事**没有任何一处真正做全**：
 *  · 并发：`Promise.allSettled(sources.map(...))` 把全部启用源同时打出去，
 *    十几个源一起抢连接，谁先超时不取决于谁坏，先回来的错误还未必是真实原因；
 *  · 退避：定时器每 N 分钟把**已知坏掉的源**再打一遍，持续制造无意义请求
 *    （这些源在被目标站点限流的场景下，等于定时帮用户加深风控）；
 *  · 状态：只有 lastFetchedAt（每次尝试都写），无法回答「这个源最后一次出数据是什么时候」。
 *
 * 现在：并发上限 3、同一源在途去重（单飞）、连续失败按指数退避、
 * 成功/失败分别写 lastSuccessAt / failCount。三处调用点共用本模块。
 */
import { db } from '../../db/db'
import { useSourceStore } from '../../stores/useSourceStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { classifyFetchError, isRetryable, type FetchErrorKind } from './errors'
import { fetchFromSource } from './providers/registry'
import { saveFetchedItems } from './retention'
import { dedupeKey } from './dedupe'
import type { IntelligenceItem, IntelligenceSource } from '../../types/entities'

/** 同一次刷新的最大并发。3 是折中：手机端同时开太多连接会互相拖慢，
 *  而 1 个串行又会让 7 个源的刷新等成半分钟 */
const MAX_CONCURRENCY = 3

/** 退避基数与上限：失败 1 次等 1 分钟，之后翻倍，最长 30 分钟 */
const BACKOFF_BASE_MS = 60_000
const BACKOFF_MAX_MS = 30 * 60_000

export function backoffMs(failCount: number): number {
  if (failCount <= 0) return 0
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failCount - 1))
}

/** 本次刷新里被退避跳过、没发请求的源 */
export interface SkippedSource {
  sourceId: string
  sourceName: string
  /** 还要等多久才允许再打（毫秒） */
  retryAfterMs: number
}

export interface SourceFetchFailure {
  sourceId: string
  sourceName: string
  kind: FetchErrorKind
  message: string
  /** 重试是否有意义（配置/解析类失败重试无意义，界面上不该再劝用户点重试） */
  retryable: boolean
}

export interface RefreshResult {
  /** 本次拉到的全部条目（未去重、未落库） */
  items: IntelligenceItem[]
  failures: SourceFetchFailure[]
  skipped: SkippedSource[]
  /** 实际发出请求的源数 */
  attempted: number
  /** 去重后实际写入的条数 */
  added: number
  /** 因保留上限被裁掉的条数 */
  removed: number
}

/** 一次源级执行的结果；skip 与 fail 分开，因为「没打」不该显示成红色错误 */
interface SourceOutcome {
  sourceId: string
  sourceName: string
  items: IntelligenceItem[]
  failure?: SourceFetchFailure
  skippedMs?: number
}

/** 在途请求表：同一个源在同一时刻只允许有一个进行中的请求 */
const inFlight = new Map<string, Promise<SourceOutcome>>()
let statusDirty = false

/**
 * 记录抓取状态。
 *
 * 这里**有意**绕开 store 工厂直写本机字段，原因是 store 工厂的 `update` 经 repo
 * 会强制刷新 `updatedAt`。而 `updatedAt` 参与跨设备 LWW 合并：
 * 一旦每次抓取都把它推到「现在」，另一台设备上对源的改名/改分类
 * （updatedAt 较早）就会在合并时被本机这份「刚从网络回来的状态」静默覆盖。
 * 这些字段已在 SyncService.LOCAL_ONLY_FIELDS 声明为本机字段，
 * 语义上也不属于业务数据 —— 它们描述的是「本机这次抓得怎么样」。
 */
async function persistStatus(
  sourceId: string,
  patch: Partial<Pick<IntelligenceSource, 'lastFetchedAt' | 'lastSuccessAt' | 'lastError' | 'failCount'>>,
): Promise<void> {
  await db.intelligenceSources.update(sourceId, patch)
  statusDirty = true
}

/** 状态写完后刷新内存，否则源卡片上还是上一次的成败信息 */
async function flushStatus(): Promise<void> {
  if (!statusDirty) return
  statusDirty = false
  await useSourceStore.getState().load()
}

async function execute(
  source: IntelligenceSource,
  opts: { force?: boolean },
): Promise<SourceOutcome> {
  const base: SourceOutcome = { sourceId: source.id, sourceName: source.name, items: [] }

  // 退避：连续失败的源不必每次刷新都陪跑。手动重试传 force 绕过，
  // 因为用户点「重试」的意思就是「我知道它坏了，现在再试一次」
  if (!opts.force) {
    const wait = backoffMs(source.failCount ?? 0)
    if (wait > 0 && source.lastFetchedAt) {
      const elapsed = Date.now() - new Date(source.lastFetchedAt).getTime()
      if (elapsed < wait) return { ...base, skippedMs: wait - elapsed }
    }
  }

  const now = new Date().toISOString()
  try {
    const items = await fetchFromSource(source)
    await persistStatus(source.id, {
      lastFetchedAt: now,
      lastSuccessAt: now,
      lastError: undefined,
      failCount: 0,
    })
    return { ...base, items }
  } catch (e) {
    const info = classifyFetchError(e)
    // 抓取失败是常态（源会失效、会被限流），用 warn 而非 error：
    // 逐源的失败原因已经写进源卡片，控制台再堆栈一遍只会淹没真正的问题
    console.warn(`[intel:${source.provider}] ${source.name} 抓取失败 · ${info.kind}`, info.message)
    await persistStatus(source.id, {
      lastFetchedAt: now,
      lastError: info.message,
      failCount: (source.failCount ?? 0) + 1,
    })
    return {
      ...base,
      failure: {
        sourceId: source.id,
        sourceName: source.name,
        kind: info.kind,
        message: info.message,
        retryable: isRetryable(info.kind),
      },
    }
  }
}

/** 单源执行（同一源在途合并为一次请求） */
function runSource(source: IntelligenceSource, opts: { force?: boolean }): Promise<SourceOutcome> {
  const running = inFlight.get(source.id)
  if (running) return running
  const task = execute(source, opts).finally(() => inFlight.delete(source.id))
  inFlight.set(source.id, task)
  return task
}

/** 并发上限内跑完所有任务；不引入外部依赖（项目约束：不加 package.json 之外的包） */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const worker = async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      out[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

function splitOutcomes(outcomes: SourceOutcome[]): {
  items: IntelligenceItem[]
  failures: SourceFetchFailure[]
  skipped: SkippedSource[]
} {
  const items: IntelligenceItem[] = []
  const failures: SourceFetchFailure[] = []
  const skipped: SkippedSource[] = []
  for (const o of outcomes) {
    items.push(...o.items)
    if (o.failure) failures.push(o.failure)
    if (o.skippedMs != null) {
      skipped.push({ sourceId: o.sourceId, sourceName: o.sourceName, retryAfterMs: o.skippedMs })
    }
  }
  return { items, failures, skipped }
}

/**
 * 只保留库里没有的条目。
 * 批内也要去重：同一个链接可能同时命中两个源的搜索结果，
 * 不去重就会在同一次落库里写进两条 id 不同、内容相同的记录。
 */
function onlyNew(items: IntelligenceItem[]): IntelligenceItem[] {
  const known = new Set(useIntelligenceStore.getState().items.map((x) => dedupeKey(x)))
  const seen = new Set<string>()
  const fresh: IntelligenceItem[] = []
  for (const it of items) {
    const key = dedupeKey(it)
    if (known.has(key) || seen.has(key)) continue
    seen.add(key)
    fresh.push(it)
  }
  return fresh
}

let refreshInFlight: Promise<RefreshResult> | null = null

/**
 * 刷新全部启用源：拉取 → 去重 → 落库 → 按上限裁剪。
 *
 * 整轮单飞：定时器到点时用户正好手动点了「拉取情报」，只有第一轮真的发请求，
 * 第二次调用拿到的是同一个 Promise。此前两个入口各跑一轮，
 * 同一批源被连打两次，直接撞上目标站点限流。
 *
 * @param force 忽略退避（用户显式点重试时用）
 */
export function refreshAll(opts: { force?: boolean } = {}): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight
  const task = doRefresh(opts).finally(() => {
    refreshInFlight = null
  })
  refreshInFlight = task
  return task
}

async function doRefresh(opts: { force?: boolean }): Promise<RefreshResult> {
  const enabled = useSourceStore.getState().items.filter((s) => s.enabled)
  if (enabled.length === 0) {
    return { items: [], failures: [], skipped: [], attempted: 0, added: 0, removed: 0 }
  }
  const outcomes = await mapLimit(enabled, MAX_CONCURRENCY, (s) =>
    runSource(s, { force: opts.force }),
  )
  const { items, failures, skipped } = splitOutcomes(outcomes)
  const fresh = onlyNew(items)
  const { added, removed } = await saveFetchedItems(fresh)
  await flushStatus()
  return {
    items,
    failures,
    skipped,
    attempted: enabled.length - skipped.length,
    added,
    removed,
  }
}

/**
 * 手动重试单个源（忽略退避）。返回本次拉到并写入的条数。
 * 与整轮刷新共用同一个在途表：整轮刷新正在打这个源时，
 * 单源重试直接复用那次请求，不会把同一个源连打两次。
 */
export async function retrySource(
  source: IntelligenceSource,
): Promise<{ items: IntelligenceItem[]; added: number; removed: number; failure?: SourceFetchFailure }> {
  const outcome = await runSource(source, { force: true })
  await flushStatus()
  if (outcome.failure) return { items: [], added: 0, removed: 0, failure: outcome.failure }
  const fresh = onlyNew(outcome.items)
  const { added, removed } = await saveFetchedItems(fresh)
  return { items: outcome.items, added, removed }
}

/**
 * 测试单个源（不落库情报，只记录状态）。
 * 返回结果对象而不是抛错：测试的用途正是把失败原因摊开给用户看，
 * 走异常通道会丢掉已经算好的 kind（只能靠错误文本再猜一次）。
 */
export async function testSource(
  source: IntelligenceSource,
): Promise<{ ok: true; items: IntelligenceItem[] } | { ok: false; failure: SourceFetchFailure }> {
  const outcome = await runSource(source, { force: true })
  await flushStatus()
  if (outcome.failure) return { ok: false, failure: outcome.failure }
  return { ok: true, items: outcome.items }
}
