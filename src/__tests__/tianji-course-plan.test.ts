/**
 * 天机 · `courses.plan` 工具（2026-10-02 新增）
 *
 * 只读工具：学分进度账 + 候选清单。本文件钉住两条行为：
 *  ① 空库时**如实说"还没有选课规划条目"**，不编造进度（防幻觉的底线）；
 *  ② 有数据时给出三方向进度与候选清单，`kind` 参数只看一个方向。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dexie } from 'dexie'
import { nowISO } from '../utils/id'

beforeEach(async () => {
  await Dexie.delete('yishu-workbench')
  vi.resetModules()
})

/** 每次从全新模块图取（store 是模块级单例，须与库一起重置） */
async function fresh() {
  const plugins = await import('../components/ai/plugins')
  const plans = await import('../stores/useCoursePlanStore')
  return { tool: plugins.agentToolById('courses.plan')!, planStore: plans.useCoursePlanStore }
}

describe('courses.plan 工具（只读）', () => {
  it('工具已注册，且是可直接执行的只读工具', async () => {
    const { tool } = await fresh()
    expect(tool).toBeTruthy()
    expect(tool.mode).toBe('read')
    expect(tool.requiresConfirmation).toBe(false)
  })

  it('空库：如实说"还没有选课规划条目"（不编造进度）', async () => {
    const { tool } = await fresh()
    const r = await tool.execute({})
    expect(r.count).toBe(0)
    expect(r.text).toContain('还没有选课规划条目')
  })

  it('有数据：三方向进度 + 候选清单；kind 参数只看一个方向', async () => {
    const { tool, planStore } = await fresh()
    const now = nowISO()
    await planStore.getState().save({
      id: 'cp1',
      kind: 'public',
      title: '中华文化',
      credit: 2,
      status: 'candidate',
      createdAt: now,
      updatedAt: now,
    })
    await planStore.getState().save({
      id: 'cp2',
      kind: 'limited',
      title: '金融学',
      credit: 3,
      status: 'selected',
      createdAt: now,
      updatedAt: now,
    })

    const r = await tool.execute({})
    expect(r.count).toBe(2)
    // 测试环境里目标未载入 → 按"未设目标"如实说（不猜一个目标）
    expect(r.text).toContain('限选：已选 3/0（未设目标）')
    expect(r.text).toContain('公选：已选 0/0（未设目标）')
    expect(r.text).toContain('候选 1 门：中华文化（2 学分）')

    const only = await tool.execute({ kind: 'public' })
    expect(only.text).toContain('公选：已选 0/0（未设目标）')
    expect(only.text).not.toContain('限选：')
  })
})