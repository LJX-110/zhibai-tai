/**
 * 同步快照的读写原语：**本机独有字段的剥离与还原**
 *
 * 这块的价值不在"能不能同步"，而在**不把本机状态带上云、也不让远端把它盖掉**：
 *  `intelligenceSources` 的 `lastFetchedAt / lastError / lastSuccessAt / failCount`
 * 记录的是"**这台机器**这次抓得怎么样"。若跟着快照走：
 *   · 两台设备的失败计数互相覆盖 —— A 机才失败一次，B 机同步回来变成失败 5 次；
 *   · 退避窗口凭空变长，表现为"某个源莫名不抓了"；
 *   · 还会凭空制造一堆 LWW 冲突记录（两边都觉得自己更新过）。
 * 所以：**导出时剥离，写回时保留本机原值**。这条策略以前没有测试钉着。
 *
 * 顺带守一条结构性纪律：`BUSINESS_TABLES` 里声明的每张表都必须真的在 Dexie schema 里 ——
 * 漏注册（新表只加了表对象、忘了 version().stores()）会表现为"写入静默失败"，很难查。
 */
import { describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { BUSINESS_TABLE_KEYS, BUSINESS_TABLES } from '../db/tables'
import { SYNC_TABLES, ensureMeta, exportData, modifiedAt, restoreLocalOnly, stripLocalOnly } from '../sync/snapshot'

const source = (o: Record<string, unknown> = {}) => ({
  id: 's1',
  name: '某源',
  provider: 'json',
  enabled: true,
  category: 'news',
  createdAt: '2026-09-01T00:00:00.000Z',
  lastFetchedAt: '2026-09-20T00:00:00.000Z',
  lastError: '超时',
  lastSuccessAt: '2026-09-19T00:00:00.000Z',
  failCount: 3,
  ...o,
})

describe('stripLocalOnly：导出前剥离本机独有字段', () => {
  it('情报源的 4 个"本机这次抓得怎么样"字段被删掉', () => {
    const [row] = stripLocalOnly('intelligenceSources', [source()]) as Record<string, unknown>[]
    expect(row).not.toHaveProperty('lastFetchedAt')
    expect(row).not.toHaveProperty('lastError')
    expect(row).not.toHaveProperty('lastSuccessAt')
    expect(row).not.toHaveProperty('failCount')
    // 业务字段一个都不能少
    expect(row.name).toBe('某源')
    expect(row.enabled).toBe(true)
  })

  it('**不改原对象** —— 否则导出会顺手把内存里的本机状态也删了', () => {
    const original = source()
    stripLocalOnly('intelligenceSources', [original])
    expect(original.failCount).toBe(3)
    expect(original.lastError).toBe('超时')
  })

  it('没有本机字段的表原样返回（同一引用，不做无谓拷贝）', () => {
    const rows = [{ id: 't1', title: '待办' }]
    expect(stripLocalOnly('tasks', rows)).toBe(rows)
  })

  it('空数组原样返回', () => {
    const rows: unknown[] = []
    expect(stripLocalOnly('intelligenceSources', rows)).toBe(rows)
  })
})

describe('restoreLocalOnly：写回时用本机值覆盖远端', () => {
  it('远端带来的本机字段被本机现值顶掉', async () => {
    await db.table('intelligenceSources').put(source())
    const remote = [{ ...source(), failCount: 9, lastError: undefined, lastFetchedAt: undefined }]
    const [row] = await restoreLocalOnly('intelligenceSources', remote as Record<string, unknown>[])
    expect(row.failCount).toBe(3) // 本机真值，不是远端的 9
    expect(row.lastError).toBe('超时')
  })

  it('本机没有该字段时，远端那份也要删掉（不留一台设备的残留）', async () => {
    await db.table('intelligenceSources').put(source({ id: 's2', lastError: undefined }))
    const remote = [{ ...source(), id: 's2', lastError: '别的设备的错' }]
    const [row] = await restoreLocalOnly('intelligenceSources', remote as Record<string, unknown>[])
    expect(row).not.toHaveProperty('lastError')
  })

  it('本机没有这条记录 → 原样返回（新记录首次同步下来，不该丢字段）', async () => {
    const remote = [{ ...source(), id: 'never-seen' }]
    const [row] = await restoreLocalOnly('intelligenceSources', remote as Record<string, unknown>[])
    expect(row.failCount).toBe(3)
  })

  it('没有本机字段的表原样返回', async () => {
    const rows = [{ id: 't1' }]
    expect(await restoreLocalOnly('tasks', rows)).toBe(rows)
  })
})

describe('modifiedAt：LWW 的比较依据', () => {
  it('优先 updatedAt，其次 createdAt', () => {
    expect(modifiedAt({ id: 'a', updatedAt: '2026-09-20T00:00:00.000Z' })).toBe(
      Date.parse('2026-09-20T00:00:00.000Z'),
    )
    expect(modifiedAt({ id: 'a', createdAt: '2026-09-01T00:00:00.000Z' })).toBe(
      Date.parse('2026-09-01T00:00:00.000Z'),
    )
    expect(
      modifiedAt({ id: 'a', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' }),
    ).toBe(Date.parse('2026-09-20T00:00:00.000Z'))
  })

  it('两者都缺 / 时间非法 → 0（当作最旧，不会误判成"更新过"）', () => {
    expect(modifiedAt({ id: 'a' })).toBe(0)
    expect(modifiedAt({ id: 'a', updatedAt: '不是时间' })).toBe(0)
    expect(modifiedAt({ id: 'a', updatedAt: '' })).toBe(0)
  })
})

describe('业务表注册完整性（结构性护栏）', () => {
  it('**BUSINESS_TABLES 里的每张表都真的存在于 Dexie schema**', async () => {
    await db.open()
    const names = new Map(db.tables.map((t) => [t.name, t]))
    const missing = BUSINESS_TABLE_KEYS.filter((k) => !names.has(k))
    // 漏注册 = 写入静默失败 + 不进同步；新表最容易漏这一步（petState 当年就差点漏）
    expect(missing).toEqual([])
  })

  it('表名与显示名都不重复（改一个漏另一个会让设置页统计串行）', () => {
    const keys = BUSINESS_TABLES.map((t) => t.key)
    const labels = BUSINESS_TABLES.map((t) => t.label)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('SYNC_TABLES 与业务表清单同源（防再次出现"同步 23 张 / 备份 10 张"的分裂）', () => {
    expect([...SYNC_TABLES]).toEqual([...BUSINESS_TABLE_KEYS])
  })
})

describe('ensureMeta / exportData', () => {
  it('设备号只生成一次，重复调用返回同一个（否则每台设备每次同步都像换了机器）', async () => {
    const a = await ensureMeta()
    const b = await ensureMeta()
    expect(a.deviceId).toBe(b.deviceId)
    expect(a.deviceId).toBeTruthy()
    expect(b.version).toBeGreaterThanOrEqual(a.version)
  })

  it('导出的表清单含全部业务表 + 墓碑表，且不含本机独有字段', async () => {
    await db.table('intelligenceSources').put(source({ id: 'exp-1' }))
    const data = await exportData()
    for (const key of BUSINESS_TABLE_KEYS) expect(data).toHaveProperty(key)
    expect(data).toHaveProperty('tombstones')
    const rows = data.intelligenceSources as Record<string, unknown>[]
    const mine = rows.find((r) => r.id === 'exp-1')
    expect(mine).toBeTruthy()
    expect(mine).not.toHaveProperty('failCount')
  })
})
