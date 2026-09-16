/**
 * diffRemoteImports —— 同步「远端带来」的差异统计
 * 验证语境：此前把远端快照记录总数当「拉取 N 条」，
 * 两台设备数据一致时也会显示一个大数字，误导用户以为有新数据。
 */
import { describe, expect, it } from 'vitest'
import { diffRemoteImports } from '../sync/SyncService'

const now = '2026-09-16T00:00:00.000Z'

const local = {
  tasks: [
    { id: 'a', title: '本地任务', updatedAt: now },
    { id: 'b', title: '两边都有但不同', updatedAt: now, done: true },
  ],
  courses: [{ id: 'c1', name: '本地课程', updatedAt: now }],
  financeRecords: [],
}

const remote = {
  tasks: [
    { id: 'a', title: '本地任务', updatedAt: now }, // 与本地一致 → 不变更
    { id: 'b', title: '两边都有但不同', updatedAt: now, done: false }, // 内容不同 → 更新
    { id: 'c', title: '远端新增任务', updatedAt: now }, // 本地没有 → 新增
  ],
  courses: [
    { id: 'c1', name: '本地课程', updatedAt: now },
    { id: 'c2', name: '另一台设备加的课程', updatedAt: now }, // 新增
  ],
  financeRecords: [{ id: 'f1', amount: 88, title: '购买', updatedAt: now }], // 新增
}

describe('diffRemoteImports', () => {
  it('只统计远端带来的真实变化（新增 + 更新），同一记录不算', () => {
    const diff = diffRemoteImports(local, remote)
    expect(diff.added).toBe(3)
    expect(diff.updated).toBe(1)
  })

  it('按变化量排序并提供表级明细（取前 3 张）', () => {
    const diff = diffRemoteImports(local, remote)
    // tasks 有 1 新增 + 1 更新 = 2 条变化，排第一；courses / financeRecords 各 1 条新增
    expect(diff.byTable[0]).toEqual({ table: 'tasks', added: 1, updated: 1 })
    expect(diff.byTable).toHaveLength(3)
    expect(new Set(diff.byTable.map((b) => b.table))).toEqual(
      new Set(['tasks', 'courses', 'financeRecords']),
    )
  })

  it('两边一致时不产生任何变化', () => {
    const diff = diffRemoteImports(remote, remote)
    expect(diff.added).toBe(0)
    expect(diff.updated).toBe(0)
    expect(diff.byTable).toHaveLength(0)
  })
})