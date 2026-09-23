/**
 * 今日炁象「心」维度验证
 *
 * 「心」原先只由 journals 表驱动，而那张表全仓没有写入入口 —— 于是它恒为 0、
 * 总分被压到事实上限 80。现在数据源改为**记录类笔记**（notes 里 kind === 'note'），
 * 这里锁住三档取值与「心与创不重叠」这两条契约，避免以后又被改回死值。
 */
import { describe, expect, it } from 'vitest'
import {
  computeCultivation,
  cultivationSources,
  type CultivationInput,
} from '../services/cultivation'

/** 除心以外全部清零，便于单独观察心的贡献 */
const base: CultivationInput = {
  tasksDoneToday: 0,
  focusMinutesToday: 0,
  waterRatio: 0,
  habitLogsToday: 0,
  bodyLogsToday: 0,
  notesToday: 0,
  creationsToday: 0,
}

const xin = (notesToday: number) =>
  computeCultivation({ ...base, notesToday }).dimensions.find((d) => d.key === 'xin')?.value

describe('心维度：记录类笔记驱动', () => {
  it('0 条 → 0', () => {
    expect(xin(0)).toBe(0)
  })

  it('1 条 → 12', () => {
    expect(xin(1)).toBe(12)
  })

  it('2 条 → 仍是 12（中档不随条数线性增长）', () => {
    expect(xin(2)).toBe(12)
  })

  it('3 条及以上 → 20（封顶）', () => {
    expect(xin(3)).toBe(20)
    expect(xin(99)).toBe(20)
  })

  it('心的分值不影响其它维度', () => {
    const withNotes = computeCultivation({ ...base, notesToday: 3 })
    const others = withNotes.dimensions.filter((d) => d.key !== 'xin')
    expect(others.every((d) => d.value === 0)).toBe(true)
    expect(withNotes.total).toBe(20)
  })
})

describe('五维结构与总分口径', () => {
  it('维度齐全且顺序为 行 学 身 心 创', () => {
    expect(computeCultivation(base).dimensions.map((d) => d.label)).toEqual([
      '行',
      '学',
      '身',
      '心',
      '创',
    ])
  })

  it('每维上限 20、总分上限 100', () => {
    const full = computeCultivation({
      tasksDoneToday: 5,
      focusMinutesToday: 100,
      waterRatio: 1,
      habitLogsToday: 5,
      bodyLogsToday: 5,
      notesToday: 3,
      creationsToday: 4,
    })
    expect(full.dimensions.every((d) => d.max === 20 && d.value <= 20)).toBe(true)
    expect(full.total).toBe(100)
  })

  it('全部为零时总分为 0（没有隐藏的保底分）', () => {
    expect(computeCultivation(base).total).toBe(0)
  })
})

describe('cultivationSources 来源分解', () => {
  it('无笔记时不产出「记录」这一项', () => {
    const labels = cultivationSources(base).map((s) => s.label)
    expect(labels).not.toContain('记录')
  })

  it('有笔记时产出「记录」，且分值与心维度一致', () => {
    const one = cultivationSources({ ...base, notesToday: 1 })
    expect(one.find((s) => s.label === '记录')?.value).toBe(12)
    const three = cultivationSources({ ...base, notesToday: 3 })
    expect(three.find((s) => s.label === '记录')?.value).toBe(20)
  })

  it('记录与创作是两项独立来源（不互相吞并）', () => {
    const labels = cultivationSources({ ...base, notesToday: 1, creationsToday: 1 }).map((s) => s.label)
    expect(labels).toContain('记录')
    expect(labels).toContain('创作')
  })
})
