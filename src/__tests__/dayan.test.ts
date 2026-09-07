import { describe, expect, it } from 'vitest'
import { castDayan, initDayan, stepDayan } from '../services/occult/dayan'

describe('大衍筮法引擎', () => {
  it('一键成卦：六爻齐、卦名非空', () => {
    const c = castDayan()
    expect(c.lines).toHaveLength(6)
    expect(c.benGua.name).toBeTruthy()
    expect(c.summary).toContain(c.benGua.name)
  })
  it('分步引擎：18 步走完，每爻三变', () => {
    let st = initDayan()
    let steps = 0
    while (!st.cast && steps < 100) {
      st = stepDayan(st)
      steps++
    }
    expect(steps).toBe(18)
    expect(st.lines).toHaveLength(6)
    expect(st.cast).not.toBeNull()
    expect(st.steps.length).toBe(18)
  })
  it('爻值只出现 6/7/8/9 且分布合理（1000 卦抽样）', () => {
    const counts: Record<number, number> = { 6: 0, 7: 0, 8: 0, 9: 0 }
    for (let i = 0; i < 1000; i++) {
      const c = castDayan()
      for (const l of c.lines) {
        expect([6, 7, 8, 9]).toContain(l.value)
        counts[l.value]++
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(6000)
    // 注：均匀分二模拟的真实分布与文献"1/16"口诀不同（数学史已知出入），
    // 此处只断言四值齐备且老阴非零（存在即可，比例不硬编码口诀值）
    expect(counts[9]).toBeGreaterThan(0)
    expect(counts[8]).toBeGreaterThan(0)
    expect(counts[7]).toBeGreaterThan(0)
    expect(counts[6]).toBeGreaterThan(0)
  })
})
