/**
 * 本机独有字段的同步剥离验证
 *
 * 情报源的 lastFetchedAt / lastError 描述的是「本机这次抓得怎么样」，
 * 不该跟着快照在两台设备间来回覆盖（还会制造无意义的 LWW 冲突）。
 * 这里守住导出侧的行为：剥离只对声明过的表与字段生效，其余数据原样保留。
 */
import { describe, expect, it } from 'vitest'
import { stripLocalOnly } from '../sync/SyncService'

describe('同步导出剥离本机独有字段', () => {
  it('情报源剥离抓取时间、错误与失败计数', () => {
    const rows = [
      {
        id: 's1',
        name: 'GitHub 实用项目',
        lastFetchedAt: '2026-09-12T04:00:00.000Z',
        lastError: 'HTTP 429',
        lastSuccessAt: '2026-09-11T04:00:00.000Z',
        failCount: 3,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]
    const out = stripLocalOnly('intelligenceSources', rows) as Record<string, unknown>[]
    expect(out[0]).not.toHaveProperty('lastFetchedAt')
    expect(out[0]).not.toHaveProperty('lastError')
    // 失败计数是本机状态：若跟着快照走，A 机失败 1 次会因为 B 机同步而变成 N 次，
    // 退避时间凭空变长
    expect(out[0]).not.toHaveProperty('lastSuccessAt')
    expect(out[0]).not.toHaveProperty('failCount')
    // 参与合并的字段必须留下，否则 LWW 失去依据
    expect(out[0].updatedAt).toBe('2026-09-01T00:00:00.000Z')
    expect(out[0].name).toBe('GitHub 实用项目')
  })

  it('未声明的表整行原样返回（不误删任何字段）', () => {
    const rows = [{ id: 't1', title: '写方案', lastError: '不该被删' }]
    const out = stripLocalOnly('tasks', rows) as Record<string, unknown>[]
    expect(out[0].lastError).toBe('不该被删')
  })

  it('不修改传入数组（纯函数）', () => {
    const rows = [{ id: 's1', lastError: 'x' }]
    stripLocalOnly('intelligenceSources', rows)
    expect(rows[0].lastError).toBe('x')
  })
})
