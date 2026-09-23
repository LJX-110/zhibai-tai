/**
 * 今日炁象 —— 五维快照：行 / 学 / 身 / 心 / 创（每维 0-20，总分 0-100）
 *
 * ⚠️ **本文件不再负责境界**（2026-09-22 重做）：境界已迁到 `services/merit.ts`，
 * 由**累计功行**定阶（六境 + 抱朴六轮）。这里只产出「今日炁象」这一张快照，
 * 作为首页罗盘的视觉输入 —— **不参与境界判定**。
 * 旧版曾用「今日总分」给境界定阶（今天不记录就掉阶），那套已整体移除；
 * 两个口径**不要合并**，否则又会回到"每天清零重来"。
 *
 * 权重模型保持简单，不做复杂算法
 *
 * 「心」的数据源是**记录类笔记**（notes 里 kind === 'note' 的今日新增），
 * 不是已删除的 journals 表。它与「创」（灵感 + 收藏）刻意不重叠：
 * 心 = 记录与内省，创 = 创作与收拢 —— 两件事，两种分数。
 */

export type DimensionKey = 'xing' | 'xue' | 'shen' | 'xin' | 'chuang'

export interface DimensionResult {
  key: DimensionKey
  label: string
  value: number
  max: number
}

export interface CultivationResult {
  total: number
  dimensions: DimensionResult[]
}

export interface CultivationInput {
  /** 今日完成的待办数 */
  tasksDoneToday: number
  /** 今日专注分钟数（番茄钟 focus） */
  focusMinutesToday: number
  /** 今日喝水达标比例 0-1 */
  waterRatio: number
  /** 今日斩三尸记录条数 */
  habitLogsToday: number
  /** 今日身体记录条数 */
  bodyLogsToday: number
  /** 今日新增的记录类笔记数（心） */
  notesToday: number
  /** 今日新增创作（灵感 / 收藏） */
  creationsToday: number
}

const MAX = 20

function clamp(n: number): number {
  return Math.max(0, Math.min(MAX, Math.round(n)))
}

/** 五维计算（每维 0-20，总分 0-100） */
export function computeCultivation(input: CultivationInput): CultivationResult {
  const xing = clamp(Math.min(input.tasksDoneToday, 5) * 4) // 完成待办，5 项封顶
  const xue = clamp(Math.min(input.focusMinutesToday, 100) / 5) // 专注分钟，100 分钟封顶
  const shen = clamp(
    input.waterRatio * 10 + input.habitLogsToday * 2 + input.bodyLogsToday * 2,
  ) // 喝水 + 斩三尸 + 身体记录
  // 心：记录类笔记，三档（0 / 12 / 20）—— 分值沿用原设计，等级阈值不必改动
  const xin = clamp(input.notesToday >= 3 ? MAX : input.notesToday >= 1 ? 12 : 0)
  const chuang = clamp(Math.min(input.creationsToday, 4) * 5) // 创作，4 条封顶

  const dimensions: DimensionResult[] = [
    { key: 'xing', label: '行', value: xing, max: MAX },
    { key: 'xue', label: '学', value: xue, max: MAX },
    { key: 'shen', label: '身', value: shen, max: MAX },
    { key: 'xin', label: '心', value: xin, max: MAX },
    { key: 'chuang', label: '创', value: chuang, max: MAX },
  ]
  const total = dimensions.reduce((s, d) => s + d.value, 0)

  return { total, dimensions }
}

/**
 * 今日炁象的阶位（五阶 · 由今日五维总分定阶，**不参与境界判定**）。
 *
 * 名称取自《道德经》：**知常 → 守静 → 袭明 → 抱一 → 玄通**（总分 0-100）。
 * `tone` 取自既有品牌色（不新增颜色）；`rank` 用于比较高低。 */
export interface CultivationGrade {
  title: string
  desc: string
  /** 阶位（0 起） */
  rank: number
  /** 该阶的色（tokens 变量名） */
  tone: 'plain' | 'qing' | 'teal' | 'bronze' | 'cinnabar'
}

export function cultivationGrade(total: number): CultivationGrade {
  if (total >= 90)
    return { rank: 4, tone: 'cinnabar', title: '玄通', desc: '微妙玄通，今日与道相合，气机浑然' }
  if (total >= 65)
    return { rank: 3, tone: 'bronze', title: '抱一', desc: '营魄抱一，神返内守，今日功夫到火候' }
  if (total >= 35)
    return { rank: 2, tone: 'teal', title: '袭明', desc: '是谓袭明，气机渐足，神意清明' }
  if (total >= 10)
    return { rank: 1, tone: 'qing', title: '守静', desc: '致虚极，守静笃，尚需火候，宜再添几笔' }
  return { rank: 0, tone: 'plain', title: '知常', desc: '知常曰明，今日无事可记，养精蓄锐亦是修行' }
}

/**
 * 功行总量 = 已落账的往日 + **今日已计** + 额外（闭关）。
 *
 * ⚠️ `todayCounted` 必须计入：它代表今天已经挣到、但尚未随跨天落进 `total` 的功行。
 * 漏掉它会出现「今天做完一堆事、功行却纹丝不动，要等明天才涨」——数字与体感直接对不上。
 */
export function totalCultivation(s: {
  total: number
  bonus: number
  todayCounted?: number
}): number {
  return s.total + s.bonus + (s.todayCounted ?? 0)
}

/** 空状态工厂（首次播种 / 迁移起点） */
export function emptyCultivationState(): {
  id: 'cultivation'
  total: number
  bonus: number
  todayDate: string
  todayCounted: number
  seclusionCount: number
} {
  return {
    id: 'cultivation',
    total: 0,
    bonus: 0,
    todayDate: '',
    todayCounted: 0,
    seclusionCount: 0,
  }
}

/**
 * 今日结算（纯函数）—— 把「今日净行」的增量并进累计功行。
 *
 * 这是**通用原语**：`services/merit.ts` 算出今日功行后，由它负责逐日累加。
 *
 * 两条不变式：
 *  1. **同一天绝不重复累加**：只补 `今日功行 - 今日已计入` 的差额。
 *     当天分数还会继续涨（上午 5 分、晚上 60 分），所以不是"一天记一笔固定的数"，
 *     而是"当天随时补差额"；跨天再把当日计数落进 total 并归零。
 *  2. **只升不降**：今日总分若因撤销操作而变低，差额为负 → 记 0，
 *     已计入的功行不回收（与"境界只升不降"同一条原则）。
 */
export function settleDaily(
  s: { total: number; todayDate: string; todayCounted: number },
  todayTotal: number,
  today: string,
): { total: number; todayDate: string; todayCounted: number; gained: number } {
  let total = s.total
  let todayCounted = s.todayCounted
  // 跨天：把上一日的计数落账（它代表那天最终的功夫），今日重新开始计
  if (s.todayDate !== today) {
    total += todayCounted
    todayCounted = 0
  }
  const delta = Math.max(0, Math.round(todayTotal) - todayCounted)
  return { total, todayDate: today, todayCounted: todayCounted + delta, gained: delta }
}

/**
 * 闭关功行 —— 专门的境界提升方式。
 *
 * 「闭关」= 认领一件今日实事 + 专注一段时长（复用番茄钟，绑定待办的那次专注），
 * 完成才结算。给分刻意高于零散日常：日常是"不修就退"，闭关是"主动精进"，
 * 它才是把境界推上去的主路径。
 *
 * 计法：基础 20 点（肯坐下来本身就是门槛）+ 每 10 分钟 5 点。
 * 25 分钟 ≈ 32 点、60 分钟 ≈ 50 点、90 分钟 ≈ 65 点 —— 一次完整的闭关
 * 约等于半天的功行，与「专门提升方式」的定位相称。
 */
const SECLUSION_BASE = 20
const SECLUSION_PER_10MIN = 5

export function seclusionReward(minutes: number): number {
  const m = Math.max(0, Math.round(minutes))
  return SECLUSION_BASE + Math.floor(m / 10) * SECLUSION_PER_10MIN
}

/** 今日炁象来源分解（行为 → 得分说明，非 RPG 数值，只是记录来源） */
export function cultivationSources(input: CultivationInput): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = []
  const add = (label: string, n: number) => {
    if (n > 0) out.push({ label, value: Math.round(n) })
  }
  add('完成任务', Math.min(input.tasksDoneToday, 5) * 4)
  add('专注', Math.min(input.focusMinutesToday, 100) / 5)
  add('饮水达标', input.waterRatio * 10)
  add('斩三尸', input.habitLogsToday * 2)
  add('身体记录', input.bodyLogsToday * 2)
  add('记录', input.notesToday >= 3 ? 20 : input.notesToday >= 1 ? 12 : 0)
  add('创作', Math.min(input.creationsToday, 4) * 5)
  return out
}
