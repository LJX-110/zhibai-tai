/**
 * 奇门遁甲算法层 —— QimenEngine（纯函数，不依赖 React）
 *
 * 第一阶段实现：
 * - 天干地支基础（六十甲子）
 * - 阴阳遁（冬至→夏至阳遁 / 夏至→冬至阴遁，按月近似）
 * - 局数（简化占法，按年内天数余数；正式排盘需节气+日柱，已标注）
 * - 九宫（洛书数位） / 八门 / 九星 / 八神 / 天干入宫
 *
 * 输出结构化盘面，供九宫格 UI 渲染。
 * 注意：传统奇门「超神接气、拆补/置闰」等规则未完整实现，不做伪科学断言。
 */

export const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const
export const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const

import { currentSolarTerm, dayGanzhiIndex, ganZhiName, hourGanzhiIndex, solarYuan, SOLAR_TERM_JU } from './calendar'

/** 六十甲子 */
export function sexagenaryCycle(): string[] {
  const out: string[] = []
  for (let i = 0; i < 60; i++) {
    out.push(TIANGAN[i % 10] + DIZHI[i % 12])
  }
  return out
}

/** 地支 → 洛书宫数（简化定位，用于值符/值使示意） */
export function branchPalace(zhi: string): number {
  const map: Record<string, number> = {
    子: 1, 丑: 8, 寅: 8, 卯: 3, 辰: 4, 巳: 4,
    午: 9, 未: 2, 申: 2, 酉: 7, 戌: 6, 亥: 6,
  }
  return map[zhi] ?? 1
}

/** 九宫洛书数位（3x3：巽4 离9 坤2 / 震3 中5 兑7 / 艮8 坎1 乾6） */
export const PALACE_GRID: { pos: string; number: number; x: number; y: number }[] = [
  { pos: '巽', number: 4, x: 0, y: 0 },
  { pos: '离', number: 9, x: 1, y: 0 },
  { pos: '坤', number: 2, x: 2, y: 0 },
  { pos: '震', number: 3, x: 0, y: 1 },
  { pos: '中', number: 5, x: 1, y: 1 },
  { pos: '兑', number: 7, x: 2, y: 1 },
  { pos: '艮', number: 8, x: 0, y: 2 },
  { pos: '坎', number: 1, x: 1, y: 2 },
  { pos: '乾', number: 6, x: 2, y: 2 },
]

/** 八门 */
export const BAMEN = ['休', '生', '伤', '杜', '景', '死', '惊', '开'] as const
/** 九星（含中宫天禽） */
export const JIUXING = ['天蓬', '天任', '天冲', '天辅', '天英', '天芮', '天柱', '天心', '天禽'] as const
/** 八神 */
export const BASHEN = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'] as const

/** 干支纪年：按年份取六十甲子（简化） */
export function yearGanzhi(year: number): string {
  return sexagenaryCycle()[(year - 4 + 2400) % 60]
}

export type Dun = '阳' | '阴'

/** 阴阳遁：按月份近似（立春前属上一年，此处 1-6 月阳遁、7-12 月阴遁，简化） */
export function determineDun(month: number): Dun {
  return month >= 1 && month <= 6 ? '阳' : '阴'
}

/** 局数（简化）：阳遁取 (dayOfYear-1)%9+1；阴遁取 9-((dayOfYear-1)%9) */
export function determineJu(dayOfYear: number, dun: Dun): number {
  const base = ((dayOfYear - 1) % 9) + 1
  return dun === '阳' ? base : 10 - base
}

export interface Palace {
  x: number
  y: number
  number: number
  pos: string
  tianGan?: string
  men?: string
  xing?: string
  shen?: string
}

export interface QimenPan {
  dun: Dun
  ju: number
  /** 三元：上/中/下元（由符头定） */
  yuan?: '上元' | '中元' | '下元'
  timeLabel: string
  yearGanZhi: string
  /** v0.4：日/时干支、节气、旬首、值符值使（简化示意） */
  dayGanZhi?: string
  hourGanZhi?: string
  jieqi?: string
  xunShou?: string
  zhifu?: string
  zhishi?: string
  palaces: Palace[]
  /** 简化解读说明 */
  notes: string[]
}

/** 节气三元正式定局：阴阳遁按节气（冬至→夏至阳遁），局数按三元表 */
export function determineDunAndJu(date: Date): { dun: Dun; ju: number; yuan: '上元' | '中元' | '下元'; jieqi: string } {
  const dayIdx = dayGanzhiIndex(date)
  const term = currentSolarTerm(date)
  // 阳遁：冬至(序 23) → 夏至(序 11) 的半圈
  const dun: Dun = term.index === 23 || term.index <= 11 ? '阳' : '阴'
  const y = solarYuan(dayIdx)
  const yuan = (['上元', '中元', '下元'] as const)[y]
  const ju = SOLAR_TERM_JU[term.name]?.[y] ?? determineJu(Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000) + 1, dun)
  return { dun, ju, yuan, jieqi: term.name }
}

/** 生成奇门盘（节气三元定局） */
export function generateQimenPan(date: Date): QimenPan {
  const month = date.getMonth() + 1
  const { dun, ju, yuan, jieqi } = determineDunAndJu(date)

  // v0.4：日/时干支 + 节气 + 旬首 → 值符值使（简化示意）
  const dayIdx = dayGanzhiIndex(date)
  const hourIdx = hourGanzhiIndex(dayIdx, date.getHours())
  const dayGanZhi = ganZhiName(dayIdx)
  const hourGanZhi = ganZhiName(hourIdx)
  const xunShouIdx = hourIdx - (hourIdx % 10)
  const xunShou = ganZhiName(xunShouIdx)
  const xunZhi = DIZHI[xunShouIdx % 12]
  const zhiGong = branchPalace(xunZhi)
  const termInfo = currentSolarTerm(date)

  // 简化布盘：天干按局数平移入 8 宫（中宫存 戊/己），八门/九星/八神依洛书序轮转
  const ganSeq = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙']
  const menSeq = [...BAMEN]
  const xingSeq = [...JIUXING]
  const shenSeq = [...BASHEN]

  const palaces: Palace[] = PALACE_GRID.map((p) => {
    const idx = p.number === 5 ? 8 : (p.number + ju - 1) % 8
    return {
      x: p.x,
      y: p.y,
      number: p.number,
      pos: p.pos,
      tianGan: p.number === 5 ? undefined : ganSeq[(p.number + ju - 1) % 9],
      men: p.number === 5 ? undefined : menSeq[idx % 8],
      xing: xingSeq[(p.number + ju - 1) % 9],
      shen: p.number === 5 ? undefined : shenSeq[idx % 8],
    }
  })

  // 值符 = 旬首所落宫之星；值使 = 局数宫之门（简化示意）
  const zhifu = xingSeq[(zhiGong + ju - 1) % 9]
  const zhishi = menSeq[(ju + ju - 1) % 8] ?? menSeq[0]

  return {
    dun,
    ju,
    yuan,
    timeLabel: `${date.getFullYear()}年${month}月${date.getDate()}日`,
    yearGanZhi: yearGanzhi(date.getFullYear()),
    dayGanZhi,
    hourGanZhi,
    jieqi: termInfo.name,
    xunShou,
    zhifu,
    zhishi,
    palaces,
    notes: [
      `本盘按节气三元定局：${jieqi} ${yuan ?? ''} ${dun}遁${ju}局（节气 ±1 日近似）。`,
      `日柱 ${dayGanZhi} · 时柱 ${hourGanZhi} · 旬首 ${xunShou} · 值符 ${zhifu} · 值使 ${zhishi}。`,
      '布盘为洛书数位轮转示意；超神接气、拆补/置闰等细则未含。',
    ],
  }
}

/** 由时间字符串（yyyy-mm-ddThh:mm）生成盘 */
export function qimenFromString(iso: string): QimenPan {
  return generateQimenPan(new Date(iso))
}
