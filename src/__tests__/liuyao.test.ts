/**
 * 六爻引擎测试 —— 本卦 / 动爻 / 变卦 / 卦名
 */
import { describe, expect, it } from 'vitest'
import { buildLiuyao, hexagramFromLines, trigramFromBits, type YaoLine } from '../services/occult/liuyao'

function lines(v: (0 | 1)[]): YaoLine[] {
  return v.map((value, i) => ({ index: i + 1, value, changing: false }))
}

describe('liuyao 纯函数', () => {
  it('三阳爻 → 乾卦', () => {
    const t = trigramFromBits(1, 1, 1)
    expect(t.name).toBe('乾')
    expect(t.symbol).toBe('☰')
  })

  it('六爻全阳 → 乾为天', () => {
    const g = hexagramFromLines(lines([1, 1, 1, 1, 1, 1]))
    expect(g.name).toBe('乾')
    expect(g.lower.name).toBe('乾')
    expect(g.upper.name).toBe('乾')
  })

  it('下乾上坤 → 泰卦', () => {
    const g = hexagramFromLines(lines([1, 1, 1, 0, 0, 0]))
    expect(g.name).toBe('泰')
  })

  it('动爻生成变卦', () => {
    const l: YaoLine[] = lines([1, 1, 1, 1, 1, 1])
    l[0] = { index: 1, value: 1, changing: true } // 初爻动
    const r = buildLiuyao(l, 'manual')
    expect(r.benGua.name).toBe('乾')
    expect(r.changingCount).toBe(1)
    // 初爻由阳变阴 → 下卦乾(111)变巽(011) → 上乾下巽 = 姤
    expect(r.bianGua?.name).toBe('姤')
  })

  it('无动爻则无变卦', () => {
    const r = buildLiuyao(lines([1, 0, 1, 0, 1, 0]), 'manual')
    expect(r.changingCount).toBe(0)
    expect(r.bianGua).toBeUndefined()
  })
})
