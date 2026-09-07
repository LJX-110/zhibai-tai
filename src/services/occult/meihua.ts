/**
 * 梅花易数 —— 起卦与体用断法（简化通则版）
 *
 * 起卦四式（先天八卦数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8，余 0 作 8）：
 *  · time   年月日时起卦（公历简化：年+月+日 ÷8 为上卦，再加时辰 ÷8 为下卦，总数 ÷6 取动爻）
 *  · numbers 两数起卦（第一数 ÷8 上卦，第二数 ÷8 下卦，两数之和 ÷6 取动爻）
 *  · words  字占（默念之句去标点取字数，平分——奇数则前半少一字；
 *            前半 ÷8 上卦，后半 ÷8 下卦，总字数 ÷6 取动爻）
 *  · draw   抽签起卦（三抽：上卦签 1-8、下卦签 1-8、动爻签 1-6）
 *
 * 断法：动爻所在之卦为「用」（事），另一卦为「体」（我）。
 *  用生体=大吉 · 比和=吉 · 体克用=小吉 · 体生用=小凶 · 用克体=凶。
 * 互卦取 2/3/4 爻为下、3/4/5 爻为上；变卦翻动爻。
 */
import { hexagramOf, trigramByNum, trigramByLines, type Trigram, type HexagramInfo } from './hexagrams64'

export type MeihuaMethod = 'time' | 'numbers' | 'words' | 'draw'

export const MEIHUA_METHOD_LABEL: Record<MeihuaMethod, string> = {
  time: '年月日时起卦',
  numbers: '两数起卦',
  words: '字占（默念）',
  draw: '抽签起卦',
}

export interface MeihuaCast {
  method: MeihuaMethod
  /** 起卦依据原文（存档用） */
  seed: string
  question?: string
  /** 上卦 / 下卦（先天数 1-8） */
  n1: number
  n2: number
  /** 动爻（自下而上 1-6） */
  dongYao: number
  benGua: HexagramInfo
  huGua: HexagramInfo
  bianGua: HexagramInfo
  /** 体（我，静卦）与用（事，动爻所在卦） */
  ti: { trigram: Trigram; element: string }
  yong: { trigram: Trigram; element: string }
  /** 体用生克断语 */
  relation: string
  verdict: '大吉' | '吉' | '小吉' | '小凶' | '凶'
  /** 一句话总断 */
  summary: string
}

const MOD8 = (n: number) => {
  const m = ((n % 8) + 8) % 8
  return m === 0 ? 8 : m
}
const MOD6 = (n: number) => {
  const m = ((n % 6) + 6) % 6
  return m === 0 ? 6 : m
}

/** 由上/下卦先天数与动爻构建完整排盘 */
function buildCast(method: MeihuaMethod, seed: string, n1: number, n2: number, dongYao: number, question?: string): MeihuaCast {
  const upper = trigramByNum(n1)
  const lower = trigramByNum(n2)
  const benGua = hexagramOf(upper, lower)

  // 互卦：2/3/4 爻为下、3/4/5 爻为上（自下而上取本卦爻线）
  const lines = [...lower.lines, ...upper.lines]
  const huLower = trigramByLines([lines[1], lines[2], lines[3]])
  const huUpper = trigramByLines([lines[2], lines[3], lines[4]])
  const huGua = hexagramOf(huUpper, huLower)

  // 变卦：动爻翻转（爻位自下而上 1-6）
  const bianLines = [...lines]
  const idx = dongYao - 1
  bianLines[idx] = bianLines[idx] === 1 ? 0 : 1
  const bianLower = trigramByLines([bianLines[0], bianLines[1], bianLines[2]])
  const bianUpper = trigramByLines([bianLines[3], bianLines[4], bianLines[5]])
  const bianGua = hexagramOf(bianUpper, bianLower)

  // 体用：动爻在下卦（1-3）则下为用上为体；在上卦（4-6）则上为用下为体
  const movingIsUpper = dongYao >= 4
  const ti = movingIsUpper ? lower : upper
  const yong = movingIsUpper ? upper : lower

  let relation = ''
  let verdict: MeihuaCast['verdict']
  if (yong.element === ti.element) {
    relation = '体用比和，同气相求'
    verdict = '吉'
  } else if (generates(yong.element, ti.element)) {
    relation = `用（${yong.element}）生体（${ti.element}），彼来助我`
    verdict = '大吉'
  } else if (generates(ti.element, yong.element)) {
    relation = `体（${ti.element}）生用（${yong.element}），我气外泄`
    verdict = '小凶'
  } else if (overcomes(ti.element, yong.element)) {
    relation = `体（${ti.element}）克用（${yong.element}），我能制事`
    verdict = '小吉'
  } else {
    relation = `用（${yong.element}）克体（${ti.element}），事来压我`
    verdict = '凶'
  }

  const summary = `${benGua.name}之卦，${relation}；互卦${huGua.name}见过程，变卦${bianGua.name}示归宿，断曰：${verdict}。`

  return {
    method,
    seed,
    question: question?.trim() || undefined,
    n1: MOD8(n1),
    n2: MOD8(n2),
    dongYao,
    benGua,
    huGua,
    bianGua,
    ti: { trigram: ti, element: ti.element },
    yong: { trigram: yong, element: yong.element },
    relation,
    verdict,
    summary,
  }
}

/** 五行相生：a 生 b */
function generates(a: string, b: string): boolean {
  return (
    (a === '木' && b === '火') ||
    (a === '火' && b === '土') ||
    (a === '土' && b === '金') ||
    (a === '金' && b === '水') ||
    (a === '水' && b === '木')
  )
}
/** 五行相克：a 克 b */
function overcomes(a: string, b: string): boolean {
  return (
    (a === '木' && b === '土') ||
    (a === '土' && b === '水') ||
    (a === '水' && b === '火') ||
    (a === '火' && b === '金') ||
    (a === '金' && b === '木')
  )
}

export function castMeihua(method: MeihuaMethod, opts: { question?: string; n1?: number; n2?: number; words?: string }): MeihuaCast {
  if (method === 'time') {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = now.getDate()
    const h = now.getHours() + 1 // 时辰粗化为 1-24 时序数
    const seed = `公历 ${y}-${m}-${d} ${now.getHours()} 时（简化起卦法）`
    const n1 = MOD8(y + m + d)
    const n2 = MOD8(y + m + d + h)
    const dongYao = MOD6(y + m + d + h)
    return buildCast(method, seed, n1, n2, dongYao, opts.question)
  }
  if (method === 'numbers') {
    const n1 = Math.abs(Math.trunc(opts.n1 ?? 0))
    const n2 = Math.abs(Math.trunc(opts.n2 ?? 0))
    if (n1 === 0 || n2 === 0) throw new Error('请输入两个非零数字')
    const seed = `两数：${n1}、${n2}`
    return buildCast(method, seed, MOD8(n1), MOD8(n2), MOD6(n1 + n2), opts.question)
  }
  if (method === 'words') {
    const text = (opts.words ?? '').replace(/[\s\p{P}\p{S}]+/gu, '')
    if (text.length === 0) throw new Error('请默念心中所想之事（至少一个字）')
    const L = text.length
    const n1 = MOD8(Math.ceil(L / 2))
    const n2 = MOD8(Math.floor(L / 2))
    const seed = `字占：「${text}」（${L} 字）`
    return buildCast(method, seed, n1, n2, MOD6(L), opts.question)
  }
  // draw：三抽签（抽签本身即随机，结果直接入档）
  const n1 = 1 + Math.floor(Math.random() * 8)
  const n2 = 1 + Math.floor(Math.random() * 8)
  const dongYao = 1 + Math.floor(Math.random() * 6)
  const seed = `抽签：上${n1}、下${n2}、动${dongYao}`
  return buildCast(method, seed, n1, n2, dongYao, opts.question)
}
