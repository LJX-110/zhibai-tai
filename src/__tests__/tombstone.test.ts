/**
 * Repository 墓碑与时间戳测试 —— 多端同步不丢数据的基石
 *
 * 覆盖：
 *  · 业务表 remove/clear 必须写墓碑（删除可跨设备传播）
 *  · 非业务表（同步基础设施）不写墓碑
 *  · put 缺时间戳自动补齐（LWW 依据），已有值不覆盖
 *  · update 强制刷新 updatedAt
 *  · 墓碑主键幂等（同记录重复删除只留一条）
 *
 * 每个用例前重建数据库：resetModules + Dexie.delete，
 * 保证用例之间互不污染（fake-indexeddb 是全局单例）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dexie } from 'dexie'
import type { WorkbenchDB } from '../db/db'
import type { Repository } from '../repositories/repo'
import type { SyncMeta, Task, Tombstone } from '../types/entities'

let db: WorkbenchDB
let repoFactory: typeof import('../repositories/repo')['createRepository']
let markTombstones: typeof import('../repositories/repo')['markTombstones']
let taskRepo: Repository<Task>
let syncMetaRepo: Repository<SyncMeta>

async function tombstonesOf(entityId: string): Promise<Tombstone[]> {
  return db.tombstones.where('entityId').equals(entityId).toArray()
}

function taskOf(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: '测试待办',
    done: false,
    priority: 'mid',
    tags: [],
    repeat: 'none',
    projectId: null,
    courseId: null,
    completedAt: null,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...over,
  }
}

beforeEach(async () => {
  vi.resetModules()
  await Dexie.delete('yishu-workbench')
  const dbMod = await import('../db/db')
  const repoMod = await import('../repositories/repo')
  db = dbMod.db
  repoFactory = repoMod.createRepository
  markTombstones = repoMod.markTombstones
  taskRepo = repoFactory(db.tasks)
  syncMetaRepo = repoFactory(db.syncMeta)
})

describe('业务表删除写墓碑', () => {
  it('remove：行被删，墓碑记录 entity/entityId/deletedAt', async () => {
    await taskRepo.put(taskOf('t1', { title: '甲' }))
    await taskRepo.remove('t1')

    expect(await db.tasks.get('t1')).toBeUndefined()
    const stones = await tombstonesOf('t1')
    expect(stones).toHaveLength(1)
    expect(stones[0]).toMatchObject({ entity: 'tasks', entityId: 't1' })
    expect(new Date(stones[0].deletedAt).getTime()).toBeGreaterThan(0)
  })

  it('clear：全部行被删且逐行写墓碑', async () => {
    await taskRepo.put(taskOf('c1', { title: '一' }))
    await taskRepo.put(taskOf('c2', { title: '二' }))
    await taskRepo.put(taskOf('c3', { title: '三' }))
    await taskRepo.clear()

    expect(await db.tasks.count()).toBe(0)
    for (const id of ['c1', 'c2', 'c3']) {
      expect(await tombstonesOf(id)).toHaveLength(1)
    }
  })

  it('重复删除同一记录：墓碑主键幂等，只留一条', async () => {
    await taskRepo.put(taskOf('d1', { title: '重' }))
    await taskRepo.remove('d1')
    await markTombstones('tasks', ['d1'])

    expect(await tombstonesOf('d1')).toHaveLength(1)
  })

  it('非业务表（syncMeta）删除不写墓碑', async () => {
    await syncMetaRepo.put({ id: 'meta', deviceId: 'dev-x', version: 0, lastSyncedAt: null, lastPushedAt: null })
    await syncMetaRepo.remove('meta')

    expect(await db.syncMeta.get('meta')).toBeUndefined()
    expect(await db.tombstones.count()).toBe(0)
  })
})

describe('时间戳自动补齐（LWW 依据）', () => {
  it('put 缺时间戳自动补 createdAt/updatedAt', async () => {
    // 用 cast 模拟旧数据缺时间戳的场景（repo 层必须兜底补齐）
    await taskRepo.put({ id: 's1', title: '无戳' } as unknown as Task)
    const row = await db.tasks.get('s1')
    expect(row?.createdAt).toBeTruthy()
    expect(row?.updatedAt).toBeTruthy()
  })

  it('put 已有时间戳不覆盖（保留业务语义）', async () => {
    const ts = '2020-01-01T00:00:00.000Z'
    await taskRepo.put(taskOf('s2', { title: '有戳', createdAt: ts, updatedAt: ts }))
    const row = await db.tasks.get('s2')
    expect(row?.createdAt).toBe(ts)
    expect(row?.updatedAt).toBe(ts)
  })

  it('update 强制刷新 updatedAt（修改时间必须前进）', async () => {
    const ts = '2020-01-01T00:00:00.000Z'
    await taskRepo.put(taskOf('s3', { title: '旧', updatedAt: ts }))
    await taskRepo.update('s3', { done: true })
    const row = await db.tasks.get('s3')
    expect(row?.updatedAt).not.toBe(ts)
    expect(new Date(row?.updatedAt ?? '').getTime()).toBeGreaterThan(
      new Date(ts).getTime(),
    )
  })

  it('非业务表写入不补时间戳', async () => {
    // SyncMeta.id 是字面量 'meta'（单行表），此表本无时间戳字段
    const meta: SyncMeta = { id: 'meta', deviceId: 'dev-x', version: 0, lastSyncedAt: null, lastPushedAt: null }
    await syncMetaRepo.put(meta)
    const row = await db.syncMeta.get('meta')
    expect(row).toEqual(meta)
  })
})
