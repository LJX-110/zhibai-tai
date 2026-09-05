/**
 * v0.4 术数测试 —— 干支历法 / 六爻世应六亲纳甲 / 奇门节气值符值使
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeLiuyao,
  analyzeToss,
  PALACE_TABLE,
} from '../services/occult/liuyao'
import {
  branchPalace,
  determineDunAndJu,
  generateQimenPan,
  yearGanzhi,
} from '../services/occult/qimen'
import {
  dayGanzhiIndex,
  ganZhiName,
  julianDay,
  liuShenOf,
  monthGanzhiIndex,
  yearGanzhiIndex,
} from '../services/occult/calendar'

describe('干支历法', () => {
  it('1900-01-01 为甲戌日（基准锚点）', () => {
    expect(ganZhiName(dayGanzhiIndex(new Date(1900, 0, 1)))).toBe('甲戌')
  })
  it('儒略日：2000-01-01 = 2451545', () => {
    expect(julianDay(2000, 1, 1)).toBe(2451545)
  })
  it('年干支：1984 甲子 / 2024 甲辰', () => {
    expect(yearGanzhiIndex(1984)).toBe(0)
    expect(yearGanzhiIndex(2024)).toBe(40)
    expect(ganZhiName(yearGanzhiIndex(2024))).toBe('甲辰')
    expect(yearGanzhi(2024)).toBe('甲辰')
  })
  it('月干支：2024 年 1 月（丙寅月，简化）', () => {
    // 甲辰年（甲/己年正月丙寅）
    expect(ganZhiName(monthGanzhiIndex(2024, 1))).toBe('丙寅')
  })
  it('六神：甲日青龙起，丙日朱雀起', () => {
    expect(liuShenOf('甲')[0]).toBe('青龙')
    expect(liuShenOf('丙')[0]).toBe('朱雀')
    expect(liuShenOf('壬')[0]).toBe('玄武')
  })
})

describe('六爻扩展（世应/六亲/纳甲）', () => {
  it('八宫表：乾为天属乾宫，世上爻应三爻', () => {
    expect(PALACE_TABLE['乾']).toEqual(['乾', 6, 3])
    expect(PALACE_TABLE['大有']).toEqual(['乾', 3, 6])
    expect(PALACE_TABLE['泰']).toEqual(['坤', 3, 6])
    expect(PALACE_TABLE['中孚']).toEqual(['艮', 4, 1])
  })
  it('乾为天（六阳）：世应正确，六亲按纳甲五行', () => {
    const lines = [1, 1, 1, 1, 1, 1].map((v, i) => ({
      index: i + 1,
      value: v as 0 | 1,
      changing: false,
    }))
    const a = analyzeLiuyao(lines, new Date(2024, 0, 1))
    expect(a.benGua.name).toBe('乾')
    expect(a.palace).toBe('乾')
    expect(a.palaceElement).toBe('金')
    expect(a.shiYao).toBe(6)
    expect(a.yingYao).toBe(3)
    // 六亲：初爻子水（金生水→子孙）、五爻申金（同→兄弟）、上爻戌土（土生金→父母）
    expect(a.lines[0].qin).toBe('子孙')
    expect(a.lines[0].zhi).toBe('子')
    expect(a.lines[4].qin).toBe('兄弟')
    expect(a.lines[5].qin).toBe('父母')
    expect(a.lines[0].position).toBe('') // 非世非应
    expect(a.lines[5].position).toBe('世')
    expect(a.lines[2].position).toBe('应')
  })
  it('动爻产生变卦', () => {
    const heads: (0 | 1 | 2 | 3)[] = [3, 1, 1, 1, 1, 1] // 初爻老阳
    const a = analyzeToss(heads, new Date(2024, 0, 1))
    expect(a.changingCount).toBe(1)
    expect(a.bianGua).toBeDefined()
  })
})

describe('奇门扩展（节气/旬首/值符值使）', () => {
  it('生成盘包含 v0.4 结构化字段', () => {
    const pan = generateQimenPan(new Date(2024, 5, 15, 10, 0))
    expect(pan.dayGanZhi).toBeTruthy()
    expect(pan.hourGanZhi).toBeTruthy()
    expect(pan.jieqi).toBeTruthy()
    expect(pan.xunShou).toBeTruthy()
    expect(pan.zhifu).toBeTruthy()
    expect(pan.zhishi).toBeTruthy()
    expect(pan.palaces).toHaveLength(9)
    expect(pan.notes.some((n) => n.includes('值符'))).toBe(true)
  })
  it('地支 → 洛书宫', () => {
    expect(branchPalace('子')).toBe(1)
    expect(branchPalace('午')).toBe(9)
    expect(branchPalace('卯')).toBe(3)
  })
  it('节气三元正式定局：三元合法、局数 1-9、盘面含 yuan', () => {
    const r = determineDunAndJu(new Date(2024, 0, 15))
    expect(['上元', '中元', '下元']).toContain(r.yuan)
    expect(r.ju).toBeGreaterThanOrEqual(1)
    expect(r.ju).toBeLessThanOrEqual(9)
    expect(r.jieqi).toBeTruthy()
    const pan = generateQimenPan(new Date(2024, 0, 15))
    expect(pan.yuan).toBeTruthy()
    expect(pan.notes[0]).toContain('节气三元定局')
  })
})
