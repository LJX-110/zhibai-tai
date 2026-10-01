/**
 * 好感度事件规则（Step 5-2C #5 · 用户拍板「完成加好感」）
 *
 * 守的是**产品规则**：完成一件重要的事会加好感，但**有每日上限** ——
 * 否则连点"完成"就能刷好感，好感就失去了"真实事件累积"的意义。
 */
import { describe, expect, it } from 'vitest'
import { AFFINITY_TIERS, affinityGain, affinityTier } from '../services/pet/affinity'

describe('完成加好感（task-done）', () => {
  it('事件存在且有正收益', () => {
    expect(affinityGain('task-done', 0)).toBeGreaterThan(0)
  })

  it('**受每日上限约束**：用满当天额度后再加为 0（防连点刷）', () => {
    const once = affinityGain('task-done', 0)
    expect(affinityGain('task-done', 3)).toBe(0)
    expect(once).toBe(1)
  })

  it('未知事件不加分（不静默给分）', () => {
    expect(affinityGain('not-an-event' as never, 0)).toBe(0)
  })
})

describe('好感等级与进度（E-5：不要只有一个数字）', () => {
  it('门槛表单调递增，且从 0 开始（Lv.1 不需要攒）', () => {
    expect(AFFINITY_TIERS[0]).toBe(0)
    for (let i = 1; i < AFFINITY_TIERS.length; i++) {
      expect(AFFINITY_TIERS[i]).toBeGreaterThan(AFFINITY_TIERS[i - 1])
    }
  })

  it('按累积值折算等级与本级进度', () => {
    expect(affinityTier(0)).toMatchObject({ level: 1, current: 0, span: 5 })
    expect(affinityTier(4)).toMatchObject({ level: 1, current: 4, span: 5 })
    expect(affinityTier(5)).toMatchObject({ level: 2, current: 0, span: 10 })
    expect(affinityTier(20)).toMatchObject({ level: 3, current: 5, span: 15 })
  })

  it('满级：进度为 1、span 为 null（界面显示"已满级"而不是除以零）', () => {
    const max = affinityTier(999)
    expect(max.span).toBeNull()
    expect(max.progress).toBe(1)
    expect(max.level).toBe(AFFINITY_TIERS.length)
  })

  it('进度永远在 0~1 之间（可直接当宽度用）', () => {
    for (const v of [0, 1, 4, 5, 14, 15, 29, 30, 79, 80, 500]) {
      const p = affinityTier(v).progress
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('非法输入当 0 处理（不返回 NaN 等级）', () => {
    expect(affinityTier(Number.NaN).level).toBe(1)
    expect(affinityTier(-3).level).toBe(1)
  })
})
