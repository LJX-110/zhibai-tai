/**
 * 干支历法 —— 天干地支 / 五行 / 日干支 / 年干支 / 月干支 / 节气
 * 纯函数，供六爻 / 奇门共用
 * 说明：日干支按儒略日精确计算；月干支与节气为简化近似（未按真太阳黄经/立春交节，误差 ±1 日）
 */

export const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const
export const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const

/** 干支序号 → 名称（甲子=0） */
export function ganZhiName(index: number): string {
  const i = ((index % 60) + 60) % 60
  return TIANGAN[i % 10] + DIZHI[i % 12]
}

/** 由（干序号, 支序号）求六十甲子序号（甲子=0） */
export function ganZhiIndexOf(gan: number, zhi: number): number {
  const z = ((zhi % 12) + 12) % 12
  for (let k = 0; k < 6; k++) {
    const x = (((gan + 10 * k) % 60) + 60) % 60
    if (x % 12 === z) return x
  }
  return 0
}

/** 十二月建「节」（月支随节更换；近似日 ±1 日，小寒→丑 起） */
const MONTH_JIE: { name: string; month: number; base: number; zhi: string }[] = [
  { name: '小寒', month: 1, base: 6, zhi: '丑' },
  { name: '立春', month: 2, base: 4, zhi: '寅' },
  { name: '惊蛰', month: 3, base: 6, zhi: '卯' },
  { name: '清明', month: 4, base: 5, zhi: '辰' },
  { name: '立夏', month: 5, base: 6, zhi: '巳' },
  { name: '芒种', month: 6, base: 6, zhi: '午' },
  { name: '小暑', month: 7, base: 7, zhi: '未' },
  { name: '立秋', month: 8, base: 8, zhi: '申' },
  { name: '白露', month: 9, base: 8, zhi: '酉' },
  { name: '寒露', month: 10, base: 8, zhi: '戌' },
  { name: '立冬', month: 11, base: 8, zhi: '亥' },
  { name: '大雪', month: 12, base: 7, zhi: '子' },
]

const approxJieDay = (y: number, jie: { month: number; base: number }) =>
  Math.round(jie.base + 0.2422 * (y - 1900) - Math.floor((y - 1900 - 1) / 4))

/** 月建干支（按节气）：返回 [干序号, 支序号]（寅=2） */
export function monthBuildByDate(date: Date): { gan: number; zhi: number } {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  let zhi = 0 // 子（1 月初、小寒前仍属上一年大雪月）
  for (const jie of MONTH_JIE) {
    if (m > jie.month || (m === jie.month && d >= approxJieDay(y, jie))) {
      zhi = DIZHI.indexOf(jie.zhi as (typeof DIZHI)[number])
    }
  }
  // 五虎遁：年干定寅月干
  const yearStem = TIANGAN[yearGanzhiIndex(y) % 10]
  let yinGan: number
  if (yearStem === '甲' || yearStem === '己') yinGan = 2 // 丙寅
  else if (yearStem === '乙' || yearStem === '庚') yinGan = 4 // 戊寅
  else if (yearStem === '丙' || yearStem === '辛') yinGan = 6 // 庚寅
  else if (yearStem === '丁' || yearStem === '壬') yinGan = 8 // 壬寅
  else yinGan = 0 // 甲寅
  const gan = (yinGan + ((zhi - 2 + 12) % 12)) % 10
  return { gan, zhi }
}

/** 月干支序号（按节气定月建） */
export function monthGanzhiIndexByDate(date: Date): number {
  const { gan, zhi } = monthBuildByDate(date)
  return ganZhiIndexOf(gan, zhi)
}

/** 公历 → 儒略日数（整数，标准公式） */
export function julianDay(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  )
}

/** 日干支序号（甲子=0；1900-01-01 = 甲戌，已验证基准） */
export function dayGanzhiIndex(date: Date): number {
  const jdn = julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate())
  return ((jdn + 49) % 60 + 60) % 60
}

/** 年干支序号（甲子=0；1984 甲子） */
export function yearGanzhiIndex(year: number): number {
  return ((year - 4) % 60 + 60) % 60
}

/** 五行：地支 → 五行 */
export function branchElement(branch: string): '木' | '火' | '土' | '金' | '水' {
  if (['寅', '卯'].includes(branch)) return '木'
  if (['巳', '午'].includes(branch)) return '火'
  if (['辰', '戌', '丑', '未'].includes(branch)) return '土'
  if (['申', '酉'].includes(branch)) return '金'
  return '水' // 子 亥
}

/** 五行：天干 → 五行 */
export function stemElement(stem: string): '木' | '火' | '土' | '金' | '水' {
  if (['甲', '乙'].includes(stem)) return '木'
  if (['丙', '丁'].includes(stem)) return '火'
  if (['戊', '己'].includes(stem)) return '土'
  if (['庚', '辛'].includes(stem)) return '金'
  return '水' // 壬 癸
}

/** 五行相生（key 生 value） */
const SHENG: Record<string, string> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
/** 五行相克（key 克 value） */
const KE: Record<string, string> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }

export function generates(a: string, b: string): boolean {
  return SHENG[a] === b
}
export function controls(a: string, b: string): boolean {
  return KE[a] === b
}

/** 六神（按日干定首神，初爻起顺排） */
export const LIUSHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'] as const

export function liuShenOf(dayStem: string): string[] {
  let start = 0
  if (dayStem === '甲' || dayStem === '乙') start = 0
  else if (dayStem === '丙' || dayStem === '丁') start = 1
  else if (dayStem === '戊') start = 2
  else if (dayStem === '己') start = 3
  else if (dayStem === '庚' || dayStem === '辛') start = 4
  else start = 5 // 壬 癸
  return Array.from({ length: 6 }, (_, i) => LIUSHEN[(start + i) % 6])
}

/** 月干支（简化：按公历月份近似建月，未按节气；正月建寅） */
export function monthGanzhiIndex(year: number, month: number): number {
  const yearStem = TIANGAN[yearGanzhiIndex(year) % 10]
  // 五虎遁：正月(寅) 干
  let zhengYueGan: number
  if (yearStem === '甲' || yearStem === '己') zhengYueGan = 2 // 丙
  else if (yearStem === '乙' || yearStem === '庚') zhengYueGan = 4 // 戊
  else if (yearStem === '丙' || yearStem === '辛') zhengYueGan = 6 // 庚
  else if (yearStem === '丁' || yearStem === '壬') zhengYueGan = 8 // 壬
  else zhengYueGan = 0 // 甲
  // 月支：正月寅(index2)，公历 1 月 → 寅
  const zhi = (month + 1) % 12 // 1月→2 寅, 12月→1 丑
  const gan = (zhengYueGan + (zhi - 2 + 12) % 12) % 10
  return ganZhiIndexOf(gan, zhi)
}

/** 时干支序号（简化：按时辰取日干五鼠遁，子时起） */
export function hourGanzhiIndex(dayIndex: number, hour: number): number {
  const dayStem = TIANGAN[((dayIndex % 60) + 60) % 60 % 10]
  // 五鼠遁：甲己→甲子, 乙庚→丙子, 丙辛→戊子, 丁壬→庚子, 戊癸→壬子
  let ziGan: number
  if (dayStem === '甲' || dayStem === '己') ziGan = 0 // 甲
  else if (dayStem === '乙' || dayStem === '庚') ziGan = 2 // 丙
  else if (dayStem === '丙' || dayStem === '辛') ziGan = 4 // 戊
  else if (dayStem === '丁' || dayStem === '壬') ziGan = 6 // 庚
  else ziGan = 8 // 壬
  // 时辰地支：子(0) 从 23:00-1:00
  const zhi = Math.floor(((hour + 1) % 24) / 2)
  const gan = (ziGan + zhi) % 10
  return ganZhiIndexOf(gan, zhi)
}

/** 二十四节气（名称 / 月份 / 近似基准日，用于 1901-2000 近似；±1 日） */
export const SOLAR_TERMS: { name: string; month: number; base: number }[] = [
  { name: '小寒', month: 1, base: 6 },
  { name: '大寒', month: 1, base: 20 },
  { name: '立春', month: 2, base: 4 },
  { name: '雨水', month: 2, base: 19 },
  { name: '惊蛰', month: 3, base: 6 },
  { name: '春分', month: 3, base: 21 },
  { name: '清明', month: 4, base: 5 },
  { name: '谷雨', month: 4, base: 21 },
  { name: '立夏', month: 5, base: 6 },
  { name: '小满', month: 5, base: 21 },
  { name: '芒种', month: 6, base: 6 },
  { name: '夏至', month: 6, base: 22 },
  { name: '小暑', month: 7, base: 7 },
  { name: '大暑', month: 7, base: 23 },
  { name: '立秋', month: 8, base: 7 },
  { name: '处暑', month: 8, base: 23 },
  { name: '白露', month: 9, base: 8 },
  { name: '秋分', month: 9, base: 23 },
  { name: '寒露', month: 10, base: 8 },
  { name: '霜降', month: 10, base: 24 },
  { name: '立冬', month: 11, base: 8 },
  { name: '小雪', month: 11, base: 23 },
  { name: '大雪', month: 12, base: 7 },
  { name: '冬至', month: 12, base: 22 },
]

/** 当前所在节气（简化近似；返回 { name, index, approx, date }） */
export function currentSolarTerm(date: Date): { name: string; index: number; approx: boolean; date: string } {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  let found = -1
  for (let i = 0; i < SOLAR_TERMS.length; i++) {
    const t = SOLAR_TERMS[i]
    const approxDay = Math.round(t.base + 0.2422 * (y - 1900) - Math.floor((y - 1900 - 1) / 4))
    if (m > t.month || (m === t.month && d >= approxDay)) {
      found = i
    } else if (found >= 0) {
      break
    }
  }
  if (found < 0) found = SOLAR_TERMS.length - 1 // 冬至前
  const t = SOLAR_TERMS[found]
  return {
    name: t.name,
    index: found,
    approx: true,
    date: `${y}年${t.month}月`,
  }
}

/** 节气三元局数表（奇门定局）：[上元, 中元, 下元] */
export const SOLAR_TERM_JU: Record<string, [number, number, number]> = {
  冬至: [1, 7, 4],
  小寒: [2, 8, 5],
  大寒: [3, 9, 6],
  立春: [8, 5, 2],
  雨水: [9, 6, 3],
  惊蛰: [1, 7, 4],
  春分: [3, 9, 6],
  清明: [4, 1, 7],
  谷雨: [5, 2, 8],
  立夏: [4, 1, 7],
  小满: [5, 2, 8],
  芒种: [6, 3, 9],
  夏至: [9, 3, 6],
  小暑: [8, 2, 5],
  大暑: [7, 1, 4],
  立秋: [2, 5, 8],
  处暑: [1, 4, 7],
  白露: [9, 3, 6],
  秋分: [7, 1, 4],
  寒露: [6, 9, 3],
  霜降: [5, 8, 2],
  立冬: [6, 9, 3],
  小雪: [5, 8, 2],
  大雪: [4, 7, 1],
}

/** 由日干支序号定三元：符头(最近的甲/己日)地支 子午卯酉上元 / 寅申巳亥中元 / 辰戌丑未下元 */
export function solarYuan(dayIndex: number): 0 | 1 | 2 {
  // 回溯最近一个 甲(index%10==0) 或 己(index%10==5) 日
  for (let back = 0; back < 10; back++) {
    const idx = (((dayIndex - back) % 60) + 60) % 60
    const stem = idx % 10
    if (stem === 0 || stem === 5) {
      const zhi = DIZHI[idx % 12]
      if (zhi === '子' || zhi === '午' || zhi === '卯' || zhi === '酉') return 0
      if (zhi === '寅' || zhi === '申' || zhi === '巳' || zhi === '亥') return 1
      return 2
    }
  }
  return 0
}
