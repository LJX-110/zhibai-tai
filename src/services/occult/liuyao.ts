/**
 * 六爻算法层 —— LiuyaoEngine（纯函数，不依赖 React）
 * 支持：本卦 / 动爻 / 变卦 / 阴阳 / 六爻 / 上下卦 / 卦名
 * 说明：传统断卦规则（世应、六亲、纳甲等）尚未完整实现，此处明确标注，不伪造解释。
 */

/** 爻：由下往上 1-6，value=1 阳 / 0 阴，changing=动爻 */
export interface YaoLine {
  index: number
  value: 0 | 1
  changing: boolean
}

export interface Trigram {
  bits: number
  name: string
  symbol: string
}

export interface HexagramInfo {
  name: string
  upper: Trigram
  lower: Trigram
}

export interface LiuyaoResult {
  lines: YaoLine[]
  benGua: HexagramInfo
  changingCount: number
  /** 变卦（动爻翻转后），无动爻则为 undefined */
  bianGua?: HexagramInfo
  /** 起卦方式 */
  source: 'coin' | 'manual' | 'time'
}

/** 三爻（由下往上，1=阳 0=阴）→ 卦 */
export function trigramFromBits(b1: 0 | 1, b2: 0 | 1, b3: 0 | 1): Trigram {
  const bits = b1 * 4 + b2 * 2 + b3
  return TRIGRAMS[bits]
}

const TRIGRAMS: Record<number, Trigram> = {
  7: { bits: 7, name: '乾', symbol: '☰' }, // 111
  6: { bits: 6, name: '兑', symbol: '☱' }, // 110
  5: { bits: 5, name: '离', symbol: '☲' }, // 101
  4: { bits: 4, name: '震', symbol: '☳' }, // 100
  3: { bits: 3, name: '巽', symbol: '☴' }, // 011
  2: { bits: 2, name: '坎', symbol: '☵' }, // 010
  1: { bits: 1, name: '艮', symbol: '☶' }, // 001
  0: { bits: 0, name: '坤', symbol: '☷' }, // 000
}

export const TRIGRAM_ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']
export const TRIGRAM_INDEX: Record<string, number> = {
  乾: 0,
  兑: 1,
  离: 2,
  震: 3,
  巽: 4,
  坎: 5,
  艮: 6,
  坤: 7,
}

/** 六十四卦名表 [下卦][上卦]（标准八宫卦序） */
const HEX_NAMES: string[][] = [
  //         上乾     上兑     上离     上震     上巽     上坎     上艮     上坤
  /*下乾*/ ['乾', '夬', '大有', '大壮', '小畜', '需', '大畜', '泰'],
  /*下兑*/ ['履', '兑', '睽', '归妹', '中孚', '节', '损', '临'],
  /*下离*/ ['同人', '革', '离', '丰', '家人', '既济', '贲', '明夷'],
  /*下震*/ ['无妄', '随', '噬嗑', '震', '益', '屯', '颐', '复'],
  /*下巽*/ ['姤', '大过', '鼎', '恒', '巽', '井', '蛊', '升'],
  /*下坎*/ ['讼', '困', '未济', '解', '涣', '坎', '蒙', '师'],
  /*下艮*/ ['遁', '咸', '旅', '小过', '渐', '蹇', '艮', '谦'],
  /*下坤*/ ['否', '萃', '晋', '豫', '观', '比', '剥', '坤'],
]

/** 由六爻生成卦 */
export function hexagramFromLines(lines: YaoLine[]): HexagramInfo {
  if (lines.length !== 6) throw new Error('六爻需 6 爻')
  const lower = trigramFromBits(lines[0].value, lines[1].value, lines[2].value)
  const upper = trigramFromBits(lines[3].value, lines[4].value, lines[5].value)
  const name = HEX_NAMES[TRIGRAM_INDEX[lower.name]][TRIGRAM_INDEX[upper.name]] ?? `${lower.name}·${upper.name}`
  return { name, upper, lower }
}

/** 主入口：由六爻构建结果 */
export function buildLiuyao(
  lines: YaoLine[],
  source: LiuyaoResult['source'] = 'manual',
): LiuyaoResult {
  const benGua = hexagramFromLines(lines)
  const changingCount = lines.filter((l) => l.changing).length
  let bianGua: HexagramInfo | undefined
  if (changingCount > 0) {
    const flipped: YaoLine[] = lines.map((l) =>
      l.changing ? { ...l, value: (l.value === 1 ? 0 : 1) as 0 | 1 } : l,
    )
    bianGua = hexagramFromLines(flipped)
  }
  return { lines, benGua, changingCount, bianGua, source }
}

/** 由三枚铜钱结果（正/反计数）生成一爻 */
export function coinToLine(heads: 0 | 1 | 2 | 3): YaoLine {
  // 3 正=老阳(动阳) · 2 正=少阴 · 1 正=少阳 · 0 正=老阴(动阴)
  if (heads === 3) return { index: 0, value: 1, changing: true }
  if (heads === 2) return { index: 0, value: 0, changing: false }
  if (heads === 1) return { index: 0, value: 1, changing: false }
  return { index: 0, value: 0, changing: true }
}

/** 抛六次铜钱（heads 数组由下往上） */
export function tossFullGuah(heads: (0 | 1 | 2 | 3)[]): LiuyaoResult {
  const lines: YaoLine[] = heads.slice(0, 6).map((h, i) => {
    const line = coinToLine(h)
    return { ...line, index: i + 1 }
  })
  return buildLiuyao(lines, 'coin')
}

/** 卦的符号串（如 —— 或 - -） */
export function lineSymbol(value: 0 | 1, changing: boolean): string {
  const base = value === 1 ? '——' : '- -'
  return changing ? `${base}（动）` : base
}

/* ============================================================
   v0.4 扩展：世应 / 六亲 / 纳甲 / 六神 / 五行 / 月建 / 日辰
   传统规则按标准八宫、纳甲表实现；月建为简化近似（未按节气）。
   ============================================================ */

import { branchElement, controls, dayGanzhiIndex, generates, ganZhiName, hourGanzhiIndex, liuShenOf, monthGanzhiIndexByDate, yearGanzhiIndex } from './calendar'

/** 八卦五行 */
export const TRIGRAM_ELEMENT: Record<string, '木' | '火' | '土' | '金' | '水'> = {
  乾: '金',
  兑: '金',
  离: '火',
  震: '木',
  巽: '木',
  坎: '水',
  艮: '土',
  坤: '土',
}

/** 纳甲纳支：每卦内/外三爻所纳地支（由初爻起） */
export const NAJIA: Record<string, { inner: string[]; outer: string[] }> = {
  乾: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  坤: { inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'] },
  震: { inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  巽: { inner: ['丑', '亥', '酉'], outer: ['未', '巳', '卯'] },
  坎: { inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'] },
  离: { inner: ['卯', '丑', '亥'], outer: ['酉', '未', '巳'] },
  艮: { inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'] },
  兑: { inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'] },
}

/** 六十四卦 → [本宫卦名, 世爻, 应爻]（标准八宫卦序） */
export const PALACE_TABLE: Record<string, [string, number, number]> = {
  // 乾宫
  乾: ['乾', 6, 3], 姤: ['乾', 1, 4], 遁: ['乾', 2, 5], 否: ['乾', 3, 6],
  观: ['乾', 4, 1], 剥: ['乾', 5, 2], 晋: ['乾', 4, 1], 大有: ['乾', 3, 6],
  // 兑宫
  兑: ['兑', 6, 3], 困: ['兑', 1, 4], 萃: ['兑', 2, 5], 咸: ['兑', 3, 6],
  蹇: ['兑', 4, 1], 谦: ['兑', 5, 2], 小过: ['兑', 4, 1], 归妹: ['兑', 3, 6],
  // 离宫
  离: ['离', 6, 3], 旅: ['离', 1, 4], 鼎: ['离', 2, 5], 未济: ['离', 3, 6],
  蒙: ['离', 4, 1], 涣: ['离', 5, 2], 讼: ['离', 4, 1], 同人: ['离', 3, 6],
  // 震宫
  震: ['震', 6, 3], 豫: ['震', 1, 4], 解: ['震', 2, 5], 恒: ['震', 3, 6],
  升: ['震', 4, 1], 井: ['震', 5, 2], 大过: ['震', 4, 1], 随: ['震', 3, 6],
  // 巽宫
  巽: ['巽', 6, 3], 小畜: ['巽', 1, 4], 家人: ['巽', 2, 5], 益: ['巽', 3, 6],
  无妄: ['巽', 4, 1], 噬嗑: ['巽', 5, 2], 颐: ['巽', 4, 1], 蛊: ['巽', 3, 6],
  // 坎宫
  坎: ['坎', 6, 3], 节: ['坎', 1, 4], 屯: ['坎', 2, 5], 既济: ['坎', 3, 6],
  革: ['坎', 4, 1], 丰: ['坎', 5, 2], 明夷: ['坎', 4, 1], 师: ['坎', 3, 6],
  // 艮宫
  艮: ['艮', 6, 3], 贲: ['艮', 1, 4], 大畜: ['艮', 2, 5], 损: ['艮', 3, 6],
  睽: ['艮', 4, 1], 履: ['艮', 5, 2], 中孚: ['艮', 4, 1], 渐: ['艮', 3, 6],
  // 坤宫
  坤: ['坤', 6, 3], 复: ['坤', 1, 4], 临: ['坤', 2, 5], 泰: ['坤', 3, 6],
  大壮: ['坤', 4, 1], 夬: ['坤', 5, 2], 需: ['坤', 4, 1], 比: ['坤', 3, 6],
}

/** 单爻详情 */
export interface LiuyaoLineDetail {
  index: number
  value: 0 | 1
  changing: boolean
  /** 纳支 */
  zhi: string
  /** 爻五行 */
  element: string
  /** 六亲（相对本宫） */
  qin: '兄弟' | '父母' | '子孙' | '官鬼' | '妻财'
  /** 六神 */
  shen: string
  /** 世/应 */
  position: '世' | '应' | ''
}

export interface LiuyaoAnalysis {
  benGua: HexagramInfo
  bianGua?: HexagramInfo
  lines: LiuyaoLineDetail[]
  /** 八宫 */
  palace: string
  /** 本宫五行 */
  palaceElement: string
  shiYao: number
  yingYao: number
  /** 年月日时干支 */
  yearGanZhi: string
  monthGanZhi: string
  dayGanZhi: string
  hourGanZhi: string
  /** 动爻 */
  changingCount: number
  notes: string[]
}

/** 完整六爻分析（纯函数） */
export function analyzeLiuyao(lines: YaoLine[], date: Date = new Date()): LiuyaoAnalysis {
  const benGua = hexagramFromLines(lines)
  const palaceEntry = PALACE_TABLE[benGua.name] ?? ['乾', 6, 3]
  const palace = palaceEntry[0]
  const shiYao = palaceEntry[1]
  const yingYao = palaceEntry[2]
  const palaceElement = TRIGRAM_ELEMENT[palace]

  const dayIdx = dayGanzhiIndex(date)
  const dayStem = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'][dayIdx % 10]
  const liuShen = liuShenOf(dayStem)

  const najia = NAJIA[palace] ?? NAJIA['乾']
  const detail: LiuyaoLineDetail[] = lines.map((l, i) => {
    const zhi = i < 3 ? najia.inner[i] : najia.outer[i - 3]
    const element = branchElement(zhi)
    // 六亲：以本宫为我
    let qin: LiuyaoLineDetail['qin']
    if (element === palaceElement) qin = '兄弟'
    else if (generates(element, palaceElement)) qin = '父母'
    else if (generates(palaceElement, element)) qin = '子孙'
    else if (controls(element, palaceElement)) qin = '官鬼'
    else qin = '妻财'
    return {
      index: l.index,
      value: l.value,
      changing: l.changing,
      zhi,
      element,
      qin,
      shen: liuShen[i],
      position: l.index === shiYao ? '世' : l.index === yingYao ? '应' : '',
    }
  })

  const changingCount = lines.filter((l) => l.changing).length
  let bianGua: HexagramInfo | undefined
  if (changingCount > 0) {
    const flipped = lines.map((l) => (l.changing ? { ...l, value: (l.value === 1 ? 0 : 1) as 0 | 1 } : l))
    bianGua = hexagramFromLines(flipped)
  }

  return {
    benGua,
    bianGua,
    lines: detail,
    palace,
    palaceElement,
    shiYao,
    yingYao,
    yearGanZhi: ganZhiName(yearGanzhiIndex(date.getFullYear())),
    monthGanZhi: ganZhiName(monthGanzhiIndexByDate(date)),
    dayGanZhi: ganZhiName(dayIdx),
    hourGanZhi: ganZhiName(hourGanzhiIndex(dayIdx, date.getHours())),
    changingCount,
    notes: [
      `本卦属 ${palace}宫（${palaceElement}），世爻 ${shiYao} 应爻 ${yingYao}；月建按节气、时支按公历近似（±1 日），传统断卦细则仍待人工参详。`,
    ],
  }
}

/** 由三枚铜钱起卦并完整分析 */
export function analyzeToss(heads: (0 | 1 | 2 | 3)[], date: Date = new Date()): LiuyaoAnalysis {
  const lines: YaoLine[] = heads.slice(0, 6).map((h, i) => {
    const line = coinToLine(h)
    return { ...line, index: i + 1 }
  })
  return analyzeLiuyao(lines, date)
}
