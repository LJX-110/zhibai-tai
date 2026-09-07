/**
 * 大衍筮法 —— 《周易·系辞》五十蓍草法（真实模拟，分步交互）
 *
 * 流程：大衍之数五十，其用四十九。每爻经三变：
 *   第一变：分二（信手分左右两堆）→ 挂一（右手堆取一悬于指间，象三才）
 *           → 揲四（左右各四根一数，象四时）→ 归奇（余数扐于指间）
 *   第二变 / 第三变：同法（不再挂一）。三变毕，指间之余数定此爻：
 *   余 5 → 老阳(9) · 余 9 → 老阴(6) · 余 4 → 少阳(7) · 余 8 → 少阴(8)
 * 六爻十八变而成卦（自下而上）。老阳（9）/老阴（6）为动爻，变卦翻动爻。
 *
 * 随机源：每一变的"分二"分割点独立随机——完整模拟过程，概率分布天然正确。
 * 分步引擎：initDayan 建局 → stepDayan 每次推进一变（返回该变快照供 UI 展示）。
 */
import { hexagramOf, trigramByLines, type HexagramInfo } from './hexagrams64'

export interface DayanLine {
  index: number
  /** 6 老阴 / 7 少阳 / 8 少阴 / 9 老阳 */
  value: 6 | 7 | 8 | 9
  /** 三变归奇记录 */
  remainders: [number, number, number]
}

/** 单变快照（供分步 UI 展示） */
export interface DayanStepSnapshot {
  /** 本变序号（1-3） */
  bian: number
  /** 变前蓍草总数 */
  before: number
  /** 分二：左堆 / 右堆 */
  left: number
  right: number
  /** 挂一（仅第一变有；第二三变不挂） */
  suspended: number | null
  /** 揲四余数：左 / 右（余 0 作 4） */
  remLeft: number
  remRight: number
  /** 归奇（挂扐之余合计） */
  odd: number
  /** 变后蓍草总数 */
  after: number
}

export interface DayanCast {
  lines: DayanLine[]
  benGua: HexagramInfo
  bianGua: HexagramInfo | null
  dongYao: number | null
  summary: string
  seedNote: string
}

export interface DayanState {
  method: 'dayan'
  question?: string
  /** 已完成的爻 */
  lines: DayanLine[]
  /** 当前爻已完成的变数（0-3） */
  bians: [number, number, number]
  /** 当前爻变前蓍草数（第一变 49；后续为上一爻变毕之余） */
  currentRemaining: number
  /** 当前爻三变归奇累计 */
  oddSum: number
  /** 全程步骤快照（仪式回顾） */
  steps: DayanStepSnapshot[]
  /** 全部完成后的结果（lines.length === 6 时填充） */
  cast: DayanCast | null
}

/** 爻题：初/二/三/四/五/上 + 九/六（如 初九、六二、上九） */
export function yaoTitle(index: number, value: number): string {
  const pos = ['初', '二', '三', '四', '五', '上'][index - 1] ?? String(index)
  const num = value === 6 ? '六' : '九'
  return index === 1 ? `${pos}${num}` : `${pos}${num}`
}

/** 一键成卦：内部循环分步引擎十八变（与分步交互同一实现，逻辑单一来源） */
export function castDayan(question?: string): DayanCast {
  let st = initDayan(question)
  while (!st.cast) st = stepDayan(st)
  return st.cast!
}

/** 大衍开局：其用四十九 */
export function initDayan(question?: string): DayanState {
  return {
    method: 'dayan',
    question: question?.trim() || undefined,
    lines: [],
    bians: [0, 0, 0],
    currentRemaining: 49,
    oddSum: 0,
    steps: [],
    cast: null,
  }
}

/** 单变核心：对 remaining 执行 分二/挂一/揲四/归奇 */
function execBian(remaining: number, isFirst: boolean): DayanStepSnapshot {
  // 分二：信手分左右两堆（各至少 1）
  const left = 1 + Math.floor(Math.random() * (remaining - 1))
  const right = remaining - left
  // 挂一：仅第一变从右堆取一（象三才）；二三变不挂
  const suspended = isFirst ? 1 : null
  const rightAfter = isFirst ? right - 1 : right
  // 揲四：左右各四根一数，归奇其余（余 0 作 4）
  const remLeft = left % 4 === 0 ? 4 : left % 4
  const remRight = rightAfter % 4 === 0 ? 4 : rightAfter % 4
  const odd = remLeft + remRight + (suspended ?? 0)
  return {
    bian: 0,
    before: remaining,
    left,
    right,
    suspended,
    remLeft,
    remRight,
    odd,
    // 挂一 + 左右归奇 全部离场（此前漏扣挂一的一根，导致分布失真）
    after: remaining - odd,
  }
}

/** 推进一变：返回新状态（不可变更新） */
export function stepDayan(state: DayanState): DayanState {
  if (state.cast) return state
  // 顺序执行：找第一个尚未执行的变（每变恰好一次）
  const bianIndex = state.bians.findIndex((b) => b === 0)
  const snap = execBian(state.currentRemaining, state.bians[0] === 0)
  const snapshot: DayanStepSnapshot = { ...snap, bian: bianIndex + 1 }

  const bians: [number, number, number] = [...state.bians]
  bians[bianIndex] = bians[bianIndex] + 1
  const oddSum = state.oddSum + snapshot.odd
  const steps = [...state.steps, snapshot]

  // 三变毕 → 定爻
  if (bianIndex === 2) {
    // 三变归奇总和（含首变挂一）→ 爻值（通行规则）：
    //   13 → 老阳 9 · 17 → 首变余 5 为少阴 8 / 首变余 9 为少阳 7 · 21 → 老阴 6 · 25 → 老阴 6
    let value: 6 | 7 | 8 | 9
    if (oddSum === 13) value = 9
    else if (oddSum === 17) value = steps[steps.length - 3].odd === 5 ? 8 : 7
    else if (oddSum === 21 || oddSum === 25) value = 6
    else value = 8
    const index = state.lines.length + 1
    const lastThree = steps.slice(-3).map((s) => s.odd) as [number, number, number]
    const lines: DayanLine[] = [...state.lines, { index, value, remainders: lastThree }]
    if (lines.length < 6) {
      return { ...state, lines, bians: [0, 0, 0], currentRemaining: snapshot.after, oddSum: 0, steps, cast: null }
    }
    // 六爻毕 → 成卦
    const bits = lines.map((l) => (l.value === 7 || l.value === 9 ? 1 : 0))
    const lower = trigramByLines([bits[0], bits[1], bits[2]])
    const upper = trigramByLines([bits[3], bits[4], bits[5]])
    const benGua = hexagramOf(upper, lower)
    const moving = lines.filter((l) => l.value === 6 || l.value === 9)
    let bianGua: HexagramInfo | null = null
    let dongYao: number | null = null
    if (moving.length > 0) {
      dongYao = moving[0].index
      const bb = [...bits]
      bb[dongYao - 1] = bb[dongYao - 1] === 1 ? 0 : 1
      bianGua = hexagramOf(
        trigramByLines([bb[3], bb[4], bb[5]]),
        trigramByLines([bb[0], bb[1], bb[2]]),
      )
    }
    const yaoName = (idx: number, v: number) => `${['初', '二', '三', '四', '五', '上'][idx - 1]}${v === 6 ? '六' : '九'}`
    const summary = dongYao
      ? `得 ${benGua.name} 卦，${yaoName(dongYao, lines[dongYao - 1].value)} 动，之 ${bianGua!.name} 卦。占曰：${benGua.guoci}。`
      : `得 ${benGua.name} 卦，六爻安静。占曰：${benGua.guoci}。`
    const cast: DayanCast = {
      lines,
      benGua,
      bianGua,
      dongYao,
      summary,
      seedNote: `大衍之数五十，其用四十九，十八变而成卦${state.question ? ` · 占问：${state.question}` : ''}`,
    }
    return { ...state, lines, bians: [3, 3, 3], currentRemaining: snapshot.after, oddSum, steps, cast }
  }

  // 未满三变：继续当前爻
  return {
    ...state,
    bians,
    currentRemaining: snapshot.after,
    oddSum,
    steps,
  }
}
