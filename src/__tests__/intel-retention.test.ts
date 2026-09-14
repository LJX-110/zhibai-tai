/**
 * 情报保留策略验证
 *
 * 情报是唯一会**持续自动增长**的业务表，裁剪时若忘了写墓碑，
 * 本机删掉的条目会在下一次同步被远端快照原样加回 —— 上限形同虚设，
 * 而用户在界面上看不出任何异常。这里锁住「裁剪必写墓碑」与「优先保留未读」两条契约。
 *
 * 与 tombstone.test.ts 同款隔离方式：每个用例前重建数据库
 * （fake-indexeddb 是全局单例，用例间会互相污染）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dexie } from 'dexie'
import type { WorkbenchDB } from '../db/db'
import type { IntelligenceItem } from '../types/entities'
import { createId } from '../utils/id'

let db: WorkbenchDB
let pruneIntelligence: typeof import('../services/intelligence/retention')['pruneIntelligence']
let clearReadIntelligence: typeof import('../services/intelligence/retention')['clearReadIntelligence']

beforeEach(async () => {
  vi.resetModules()
  await Dexie.delete('yishu-workbench')
  const dbMod = await import('../db/db')
  const retentionMod = await import('../services/intelligence/retention')
  db = dbMod.db
  pruneIntelligence = retentionMod.pruneIntelligence
  clearReadIntelligence = retentionMod.clearReadIntelligence
})

function itemOf(over: Partial<IntelligenceItem> = {}): IntelligenceItem {
  const id = over.id ?? createId()
  return {
    id,
    title: `条目 ${id}`,
    source: '测试源',
    sourceType: 'rss',
    category: '科技',
    tags: [],
    read: false,
    favorite: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    publishedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

describe('pruneIntelligence', () => {
  it('未超上限时不动任何数据', async () => {
    await db.intelligenceItems.bulkPut([itemOf(), itemOf(), itemOf()])
    const { removed } = await pruneIntelligence(5)
    expect(removed).toBe(0)
    expect(await db.intelligenceItems.count()).toBe(3)
  })

  it('上限为 0 表示不限制', async () => {
    await db.intelligenceItems.bulkPut([itemOf(), itemOf()])
    const { removed } = await pruneIntelligence(0)
    expect(removed).toBe(0)
    expect(await db.intelligenceItems.count()).toBe(2)
  })

  it('超上限时裁到上限，并为每条写墓碑', async () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      itemOf({ id: `i${i}`, publishedAt: `2026-09-0${i + 1}T00:00:00.000Z` }),
    )
    await db.intelligenceItems.bulkPut(items)

    const { removed } = await pruneIntelligence(3)

    expect(removed).toBe(5)
    expect(await db.intelligenceItems.count()).toBe(3)
    const stones = await db.tombstones.toArray()
    expect(stones).toHaveLength(5)
    expect(stones.every((t) => t.entity === 'intelligenceItems')).toBe(true)
    // 墓碑的 entityId 必须与被删行一一对应，否则删除无法传播
    expect(new Set(stones.map((t) => t.entityId)).size).toBe(5)
  })

  it('优先删已读、保留未读', async () => {
    await db.intelligenceItems.bulkPut([
      itemOf({ id: 'read-old', read: true, publishedAt: '2026-08-01T00:00:00.000Z' }),
      itemOf({ id: 'read-new', read: true, publishedAt: '2026-08-02T00:00:00.000Z' }),
      itemOf({ id: 'unread-old', read: false, publishedAt: '2026-08-03T00:00:00.000Z' }),
      itemOf({ id: 'unread-new', read: false, publishedAt: '2026-08-04T00:00:00.000Z' }),
    ])

    const { removed } = await pruneIntelligence(2)

    expect(removed).toBe(2)
    const alive = (await db.intelligenceItems.toArray()).map((x) => x.id).sort()
    expect(alive).toEqual(['unread-new', 'unread-old'])
  })

  it('同为已读时先删更旧的', async () => {
    await db.intelligenceItems.bulkPut([
      itemOf({ id: 'a', read: true, publishedAt: '2026-08-01T00:00:00.000Z' }),
      itemOf({ id: 'b', read: true, publishedAt: '2026-08-05T00:00:00.000Z' }),
      itemOf({ id: 'c', read: true, publishedAt: '2026-08-03T00:00:00.000Z' }),
    ])

    await pruneIntelligence(1)

    expect((await db.intelligenceItems.toArray()).map((x) => x.id)).toEqual(['b'])
  })
})

describe('clearReadIntelligence', () => {
  it('只删已读，未读保留', async () => {
    await db.intelligenceItems.bulkPut([
      itemOf({ id: 'r1', read: true }),
      itemOf({ id: 'r2', read: true }),
      itemOf({ id: 'u1', read: false }),
    ])

    const { removed } = await clearReadIntelligence()

    expect(removed).toBe(2)
    expect((await db.intelligenceItems.toArray()).map((x) => x.id)).toEqual(['u1'])
    expect(await db.tombstones.count()).toBe(2)
  })

  it('可按日期下界过滤（只清这个日期之前发布的）', async () => {
    await db.intelligenceItems.bulkPut([
      itemOf({ id: 'old', read: true, publishedAt: '2026-08-01T00:00:00.000Z' }),
      itemOf({ id: 'new', read: true, publishedAt: '2026-09-10T00:00:00.000Z' }),
    ])

    const { removed } = await clearReadIntelligence('2026-09-01')

    expect(removed).toBe(1)
    expect((await db.intelligenceItems.toArray()).map((x) => x.id)).toEqual(['new'])
  })

  it('没有已读时返回 0 且不产生墓碑', async () => {
    await db.intelligenceItems.bulkPut([itemOf({ read: false })])
    const { removed } = await clearReadIntelligence()
    expect(removed).toBe(0)
    expect(await db.tombstones.count()).toBe(0)
  })
})
