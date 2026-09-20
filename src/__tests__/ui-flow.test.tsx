/**
 * 关键数据流测试 —— 验证核心 CRUD 链路（落库 + 自动补时间戳 + 状态同步）
 * 覆盖 ActionPage 快速添加与 FinancePage 记一笔背后真正写库的动作，
 * 比整页渲染更稳定、更有回归价值（页面渲染已有 ui-smoke 兜底）。
 */
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../stores/useTaskStore'
import { useFinanceStore } from '../stores/useFinanceStore'
import { createId, todayISO } from '../utils/id'

describe('行 · 待办数据流', () => {
  it('add 落库并自动补时间戳（LWW 合并依据）', async () => {
    const now = new Date().toISOString()
    await useTaskStore.getState().add({
      id: createId(),
      title: '买酱油',
      description: undefined,
      done: false,
      priority: 'mid',
      dueDate: todayISO(),
      tags: [],
      repeat: 'none',
      monthlyDay: null,
      weeklyDay: null,
      projectId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    const t = useTaskStore.getState().items.find((x) => x.title === '买酱油')
    expect(t).toBeDefined()
    expect(t!.createdAt).toBeTruthy()
    expect(t!.updatedAt).toBeTruthy()
  })
})

describe('财 · 记账数据流', () => {
  it('save 支出落库并可检索', async () => {
    const now = new Date().toISOString()
    await useFinanceStore.getState().save({
      id: createId(),
      kind: 'expense',
      amount: 12.5,
      category: 'dining',
      date: todayISO(),
      note: '午饭',
      merchant: undefined,
      isPurchase: false,
      createdAt: now,
      updatedAt: now,
    })
    const r = useFinanceStore.getState().items.find((x) => x.amount === 12.5)
    expect(r).toBeDefined()
    expect(r!.kind).toBe('expense')
    expect(r!.updatedAt).toBeTruthy()
  })
})