/**
 * 奇门引擎测试 —— 阴阳遁 / 局数 / 九宫 / 结构完整
 */
import { describe, expect, it } from 'vitest'
import { determineDun, determineJu, generateQimenPan, yearGanzhi } from '../services/occult/qimen'

describe('qimen 纯函数', () => {
  it('阴阳遁按月判定', () => {
    expect(determineDun(3)).toBe('阳')
    expect(determineDun(8)).toBe('阴')
  })

  it('局数在 1-9 之间', () => {
    for (let d = 1; d <= 365; d++) {
      const yang = determineJu(d, '阳')
      const yin = determineJu(d, '阴')
      expect(yang).toBeGreaterThanOrEqual(1)
      expect(yang).toBeLessThanOrEqual(9)
      expect(yin).toBeGreaterThanOrEqual(1)
      expect(yin).toBeLessThanOrEqual(9)
    }
  })

  it('生成完整盘面：九宫 / 八门 / 九星 / 八神 / 干支', () => {
    const pan = generateQimenPan(new Date('2026-08-29T10:00:00'))
    expect(pan.palaces).toHaveLength(9)
    expect(pan.dun === '阳' || pan.dun === '阴').toBe(true)
    expect(pan.ju).toBeGreaterThanOrEqual(1)
    expect(pan.ju).toBeLessThanOrEqual(9)
    expect(pan.yearGanZhi).toMatch(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/)
    // 每宫有九星；非中宫有八门/八神/天干
    for (const p of pan.palaces) {
      expect(p.xing).toBeTruthy()
      if (p.number !== 5) {
        expect(p.men).toBeTruthy()
        expect(p.shen).toBeTruthy()
        expect(p.tianGan).toBeTruthy()
      }
    }
  })

  it('yearGanzhi 与已知干支一致（1984 = 甲子）', () => {
    expect(yearGanzhi(1984)).toBe('甲子')
  })
})
