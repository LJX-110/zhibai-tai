/**
 * 情报抓取编排验证 —— 并发上限、在途单飞、失败退避、状态记录
 *
 * 这些都是「抓取稳不稳定」的直接契约，且都属于**只在真实网络下才会暴露**的问题：
 *  · 并发不设限 → 十几个源同时抢连接，先超时的不一定是坏源，报错原因还未必是真的；
 *  · 不单飞 → 定时器与手动点击重叠时同一批源被连打两遍，主动把用户推向限流；
 *  · 不退避 → 已知坏掉的源每个周期再打一遍，红叉源永远不会自己安静下来。
 * 靠人工点按钮验证不了这些，所以锁在测试里。
 *
 * 用替换 PROVIDERS 的方式注入假 Provider：不碰网络、不依赖 DOMParser，
 * 又能走完「分发 → 状态记录 → 落库 → 退避」整条真实链路。
 *
 * 与 intel-retention.test.ts 同款隔离方式：每个用例前重建数据库
 * （fake-indexeddb 是全局单例，用例间会互相污染）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dexie } from 'dexie'
import type { WorkbenchDB } from '../db/db'
import type { IntelligenceItem, IntelligenceSource } from '../types/entities'
import type { IntelligenceProvider } from '../services/intelligence/providers/index'
import { createId } from '../utils/id'

let db: WorkbenchDB
let run: typeof import('../services/intelligence/run')
let sourceStore: typeof import('../stores/useSourceStore')['useSourceStore']
let providers: Record<string, IntelligenceProvider>
let classifyFetchError: typeof import('../services/intelligence/errors')['classifyFetchError']

beforeEach(async () => {
  vi.resetModules()
  await Dexie.delete('yishu-workbench')
  const dbMod = await import('../db/db')
  db = dbMod.db
  sourceStore = (await import('../stores/useSourceStore')).useSourceStore
  run = await import('../services/intelligence/run')
  providers = (await import('../services/intelligence/providers/registry')).PROVIDERS
  classifyFetchError = (await import('../services/intelligence/errors')).classifyFetchError
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 用 provider id 'json' 占位，具体行为由用例决定 */
function useProvider(fetchImpl: IntelligenceProvider['fetch']): void {
  providers.json = { id: 'json', name: '测试', fetch: fetchImpl }
}

function sourceOf(name: string, over: Partial<IntelligenceSource> = {}): IntelligenceSource {
  const now = new Date().toISOString()
  return {
    id: createId(),
    name,
    provider: 'json',
    category: '科技',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function itemOf(over: Partial<IntelligenceItem> = {}): IntelligenceItem {
  const id = over.id ?? createId()
  return {
    id,
    title: `条目 ${id}`,
    source: '测试源',
    sourceName: '测试源',
    sourceType: 'rss',
    category: '科技',
    tags: [],
    read: false,
    favorite: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

async function seed(...sources: IntelligenceSource[]): Promise<void> {
  await db.intelligenceSources.bulkPut(sources)
  await sourceStore.getState().load()
}

const currentSource = (id: string): IntelligenceSource => {
  const found = sourceStore.getState().items.find((s) => s.id === id)
  if (!found) throw new Error('源已不在 store 中')
  return found
}

describe('classifyFetchError', () => {
  it('限流单独成一类，不会被误报成「没配代理」', () => {
    expect(classifyFetchError(new Error('自建代理不可达：自建代理 HTTP 429')).kind).toBe('rate_limit')
  })

  it('反爬（412/风控）与跨域分开：前者换出口也未必能过', () => {
    expect(classifyFetchError(new Error('自建代理不可达：自建代理 HTTP 412')).kind).toBe('blocked')
  })

  it('没配代理是可操作的一步，归为待配置', () => {
    expect(classifyFetchError(new Error('跨域抓取需要自建代理（公共代理在国内已全部不可用）（直连 超时）')).kind).toBe('config')
  })

  it('浏览器把 CORS 与断网压成同一句 Failed to fetch', () => {
    expect(classifyFetchError(new TypeError('Failed to fetch')).kind).toBe('cors')
  })

  it('超时按错误名识别，不依赖各家的文案', () => {
    const e = new Error('The operation was aborted')
    e.name = 'TimeoutError'
    expect(classifyFetchError(e).kind).toBe('timeout')
  })

  it('Provider 约定前缀优先：empty / parse 不会被后续规则抢走', () => {
    expect(classifyFetchError(new Error('empty: JSON 中没有可映射的数组（检查 listPath）')).kind).toBe('empty')
    expect(classifyFetchError(new Error('parse: 不是合法 JSON（试试 RSS/Web Provider）')).kind).toBe('parse')
  })

  it('拿到状态码说明链路通、是目标自身报错', () => {
    expect(classifyFetchError(new Error('目标返回 HTTP 404（直连 HTTP 404）')).kind).toBe('http')
  })

  it('需要凭证的源归为需认证', () => {
    expect(classifyFetchError(new Error('HTTP 401 unauthorized')).kind).toBe('auth')
  })
})

describe('backoffMs', () => {
  it('失败 0 次不退避（首次抓取必须真的去打）', () => {
    expect(run.backoffMs(0)).toBe(0)
  })

  it('按次数指数增长', () => {
    expect(run.backoffMs(1)).toBe(60_000)
    expect(run.backoffMs(2)).toBe(120_000)
    expect(run.backoffMs(3)).toBe(240_000)
  })

  it('有上限，不会退避到永远不再尝试', () => {
    expect(run.backoffMs(20)).toBe(30 * 60_000)
  })
})

describe('refreshAll', () => {
  it('并发有上限：9 个源不会一次全打出去', async () => {
    let active = 0
    let peak = 0
    useProvider(async () => {
      active++
      peak = Math.max(peak, active)
      await sleep(5)
      active--
      return []
    })
    await seed(...Array.from({ length: 9 }, (_, i) => sourceOf(`源 ${i}`)))

    await run.refreshAll()

    expect(peak).toBe(3)
  })

  it('整轮刷新单飞：在途时再触发不会重复请求', async () => {
    const calls = vi.fn(async () => {
      await sleep(5)
      return []
    })
    useProvider(calls)
    await seed(sourceOf('单飞源'))

    const [a, b] = await Promise.all([run.refreshAll(), run.refreshAll()])

    expect(calls).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('连续失败的源在退避窗口内被跳过，而不是每个周期再打一遍', async () => {
    const calls = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    useProvider(calls)
    const s = sourceOf('坏源')
    await seed(s)

    const first = await run.refreshAll()
    expect(first.attempted).toBe(1)
    expect(first.failures).toHaveLength(1)
    expect(first.failures[0].kind).toBe('cors')
    expect(calls).toHaveBeenCalledTimes(1)

    const second = await run.refreshAll()
    expect(calls).toHaveBeenCalledTimes(1)
    expect(second.attempted).toBe(0)
    expect(second.skipped).toHaveLength(1)
    expect(second.skipped[0].sourceName).toBe('坏源')
  })

  it('失败写入连续失败次数，成功后清零并记下成功时刻', async () => {
    useProvider(async () => {
      throw new TypeError('Failed to fetch')
    })
    const s = sourceOf('反复源')
    await seed(s)

    await run.refreshAll()
    let row = await db.intelligenceSources.get(s.id)
    expect(row?.failCount).toBe(1)
    expect(row?.lastSuccessAt).toBeUndefined()
    expect(row?.lastError).toBeTruthy()

    useProvider(async () => [itemOf({ id: 'fixed-1', source: '反复源' })])
    const retry = await run.retrySource(currentSource(s.id))

    expect(retry.added).toBe(1)
    row = await db.intelligenceSources.get(s.id)
    expect(row?.failCount).toBe(0)
    expect(row?.lastError).toBeUndefined()
    expect(row?.lastSuccessAt).toBeTruthy()
    expect(await db.intelligenceItems.count()).toBe(1)
  })

  it('重复条目只落库一次（已知条目与批内重复都过滤）', async () => {
    const dup = itemOf({ id: 'dup-1', source: '重复源', url: 'https://example.com/a' })
    useProvider(async () => [dup, { ...dup, id: 'dup-2' }])
    const s = sourceOf('重复源')
    await seed(s)

    const first = await run.refreshAll()
    expect(first.added).toBe(1)
    expect(await db.intelligenceItems.count()).toBe(1)

    // 同一批内容下一轮再抓到：一条也不该新增
    const second = await run.refreshAll()
    expect(second.added).toBe(0)
    expect(await db.intelligenceItems.count()).toBe(1)
  })

  it('单源重试忽略退避（用户点重试就是要现在再试一次）', async () => {
    const calls = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    useProvider(calls)
    const s = sourceOf('待重试源')
    await seed(s)
    await run.refreshAll()
    expect(calls).toHaveBeenCalledTimes(1)

    const res = await run.retrySource(currentSource(s.id))

    expect(calls).toHaveBeenCalledTimes(2)
    expect(res.failure?.retryable).toBe(true)
  })

  it('关掉的源不参与抓取', async () => {
    const calls = vi.fn(async () => [])
    useProvider(calls)
    await seed(sourceOf('停用源', { enabled: false }))

    const res = await run.refreshAll()

    expect(res.attempted).toBe(0)
    expect(calls).not.toHaveBeenCalled()
  })
})
