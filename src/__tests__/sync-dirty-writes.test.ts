/**
 * 「写入出口必须置脏」回归（2026-10-20）
 *
 * 清空 / 导入恢复 / 清理已读走服务层**跨表直写**（不经 store 工厂），
 * 曾经全程不触发 `notifyDataChanged` —— 设置页显示「已是最新」，本地却已偏离远端；
 * 删除的墓碑也要等下一次无关写入才随快照传播。
 * 这里逐条钉住"写出即置脏"，同族修复说明见 `services/data-admin.ts` 文件头。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { currentSyncRevision, isDirty, markSynced } from '../sync/dirty'
import { clearAllData, exportAllData, importAllData } from '../services/data-admin'
import { clearReadIntelligence, pruneIntelligence } from '../services/intelligence/retention'

const DIRTY_KEY = 'zbt:sync-dirty:v1'

beforeEach(async () => {
  // 每个用例从「空库 + 干净标记」开始，否则"是否置脏"的断言会被上一条用例污染
  await Promise.all(db.tables.map((t) => t.clear()))
  markSynced(currentSyncRevision())
})

const taskRow = (id: string) => ({
  id,
  title: `待办 ${id}`,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
})

describe('写入出口置脏：清空 / 导入 / 清理已读', () => {
  it('导入恢复：写库后置脏并落盘（否则设置页显示「已是最新」而实际偏离远端）', async () => {
    const tables = await importAllData({ tasks: [taskRow('imp1')] })

    expect(tables).toBeGreaterThan(0)
    expect(await db.table('tasks').count()).toBe(1) // 数据真的写进去了，脏不是误报
    expect(isDirty()).toBe(true)
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1')
  })

  it('导入恢复：没有可识别业务表的文件不置脏（空输入不该挂起一次同步）', async () => {
    const tables = await importAllData({ _meta: { app: 'yishu-workbench' } })

    expect(tables).toBe(0)
    expect(isDirty()).toBe(false)
  })

  it('清空数据：实际清掉记录 → 置脏（墓碑随快照传播，其他设备才会跟着清）', async () => {
    await db.table('tasks').put(taskRow('c1'))
    await clearAllData()

    expect(await db.table('tasks').count()).toBe(0)
    expect(await db.tombstones.count()).toBeGreaterThan(0)
    expect(isDirty()).toBe(true)
  })

  it('清空数据：空库上执行不置脏（空对空不算本地改动）', async () => {
    await clearAllData()
    expect(isDirty()).toBe(false)
  })

  it('清理已读：删除后置脏（墓碑不必等下一次无关写入才传播）', async () => {
    await db.table('intelligenceItems').put({
      id: 'r1',
      title: '一条已读情报',
      read: true,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    })
    const { removed } = await clearReadIntelligence()

    expect(removed).toBe(1)
    expect(await db.tombstones.count()).toBeGreaterThan(0)
    expect(isDirty()).toBe(true)
  })

  it('按上限裁剪：删除后置脏（否则上限内删掉的条目会被远端快照加回）', async () => {
    await db.table('intelligenceItems').bulkPut([
      {
        id: 'old-read',
        title: '旧且已读',
        read: true,
        favorite: false,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'new-unread',
        title: '新且未读',
        read: false,
        favorite: false,
        createdAt: '2026-10-02T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    ])
    const { removed } = await pruneIntelligence(1)

    expect(removed).toBe(1)
    expect(await db.tombstones.count()).toBeGreaterThan(0)
    expect(isDirty()).toBe(true)
  })

  it('导出备份：只读不置脏（导出不该挂起一次同步）', async () => {
    await exportAllData()
    expect(isDirty()).toBe(false)
  })
})
