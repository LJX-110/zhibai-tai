/**
 * 道行服务 —— 由近期行为综合得出的轨迹分
 * 权重模型保持简单，不做复杂算法
 *
 * 五维：行 / 学 / 身 / 心 / 创（每维 0-20，总分 0-100）
 *
 * 「心」的数据源是**记录类笔记**（notes 里 kind === 'note' 的今日新增），
 * 不是已删除的 journals 表。它与「创」（灵感 + 收藏）刻意不重叠：
 * 心 = 记录与内省，创 = 创作与收拢 —— 两件事，两种分数。
 */
import { todayISO } from '../utils/id'

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

/** 道行等级（丹道五阶 · 由今日总分定阶）
 *  抱朴守一 → 炼精化气 → 炼气化神 → 炼神还虚 → 炼虚合道（总分 0-100）。
 *  `tone` 取自既有品牌色（不新增颜色），供境界卡取色；`rank` 用于比较高低。 */
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
    return { rank: 4, tone: 'cinnabar', title: '炼虚合道', desc: '今日与道合真，气机浑然，可称圆满' }
  if (total >= 65)
    return { rank: 3, tone: 'bronze', title: '炼神还虚', desc: '神返内守，虚静生慧，今日功夫到火候' }
  if (total >= 35)
    return { rank: 2, tone: 'teal', title: '炼气化神', desc: '气机渐足，神意清明，正合今日所得' }
  if (total >= 10)
    return { rank: 1, tone: 'qing', title: '炼精化气', desc: '精微初聚，尚需火候，宜再添几笔' }
  return { rank: 0, tone: 'plain', title: '抱朴守一', desc: '今日无事可记，养精蓄锐亦是修行' }
}

/**
 * 历史最高境界 —— 存本机。
 * 道行由**本机**今日数据算出，历史也该留在本机；跨设备同步会与"今日道行"
 * 的本机语义冲突（A 机的最高纪录不该覆盖 B 机的）。
 */
const BEST_KEY = 'zbt:cultivation-best:v1'

export interface BestRecord {
  title: string
  rank: number
  total: number
  /** 达到该纪录的日期 */
  at: string
}

export function readBest(): BestRecord | null {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed.title === 'string') return parsed as BestRecord
  } catch {
    /* 存档损坏按无记录处理 */
  }
  return null
}

/** 只在刷新纪录时写入；返回是否刷新 */
export function saveBestIfHigher(grade: CultivationGrade, total: number): boolean {
  const prev = readBest()
  if (prev && prev.rank >= grade.rank && prev.total >= total) return false
  try {
    const rec: BestRecord = { title: grade.title, rank: grade.rank, total, at: todayISO() }
    localStorage.setItem(BEST_KEY, JSON.stringify(rec))
  } catch {
    /* 存储满 / 隐私模式写不进去时放弃记录，不影响界面 */
  }
  return true
}

/* ================================================================== *
 * 修行境界（持续累积）—— 与「今日道行」是两回事
 *
 * ⚠️ 别把这两个混起来（这是本次改造的核心区分）：
 *  · `cultivationGrade(今日总分)` —— **今日道行**。当天的心境快照，今天不记录就回落，
 *    本就是"今天的功夫"，回落是对的（罗盘上「今日炁象」用它）。
 *  · `realmOf(累计修为)` —— **修行境界**。由逐日累加的修为总量定阶，**只升不降**；
 *    忙几天不记录不会把已修到的境界抹掉（那正是用户要的"持续累积"）。
 * ================================================================== */

/**
 * 境界门槛（累计修为）。取 **×3 递进**：三百 → 九百 → 二千七 → 八千一。
 * 「三三见九、九九归真」是旧说里的进境语；按每日 60-100 分计，
 * 大致对应 4 天 / 12 天 / 35 天 / 100 天的持续用功。
 * 门槛是要调就调一处的常量，不散在 UI 里。
 */
export const REALM_THRESHOLDS = [0, 300, 900, 2700, 8100] as const

/** 修行境界（与今日道行同用丹道五阶名，但口径是累计修为） */
export function realmOf(cumulative: number): CultivationGrade {
  let rank = 0
  for (let i = REALM_THRESHOLDS.length - 1; i >= 0; i--) {
    if (cumulative >= REALM_THRESHOLDS[i]) {
      rank = i
      break
    }
  }
  const meta = REALM_META[rank]
  return { rank, tone: meta.tone, title: meta.title, desc: meta.desc }
}

const REALM_META: { tone: CultivationGrade['tone']; title: string; desc: string }[] = [
  { tone: 'plain', title: '抱朴守一', desc: '守其本真，未及化气，功夫尚在日用之间' },
  { tone: 'qing', title: '炼精化气', desc: '精微初聚，气机始动，已是可持之修' },
  { tone: 'teal', title: '炼气化神', desc: '气足神清，渐能自主，修行已成习惯' },
  { tone: 'bronze', title: '炼神还虚', desc: '神返内守，虚静生慧，非一日之功所至' },
  { tone: 'cinnabar', title: '炼虚合道', desc: '积久功深，与道合真，此境以年计' },
]

/** 距下一阶的进度（用于成长页进度条）；已至顶阶时 next 为 null */
export function realmProgress(cumulative: number): {
  realm: CultivationGrade
  /** 下一阶修为门槛；null = 已至顶阶 */
  next: number | null
  nextTitle: string | null
  /** 当前阶内进度 0-1（顶阶恒为 1） */
  percent: number
  /** 距下一阶还差多少修为 */
  remaining: number
} {
  const realm = realmOf(cumulative)
  const nextIdx = realm.rank + 1
  if (nextIdx >= REALM_THRESHOLDS.length) {
    return { realm, next: null, nextTitle: null, percent: 1, remaining: 0 }
  }
  const from = REALM_THRESHOLDS[realm.rank]
  const next = REALM_THRESHOLDS[nextIdx]
  return {
    realm,
    next,
    nextTitle: REALM_META[nextIdx].title,
    percent: Math.max(0, Math.min(1, (cumulative - from) / (next - from))),
    remaining: Math.max(0, next - cumulative),
  }
}

/**
 * 修为总量 = 已落账的往日 + **今日已计** + 额外（闭关）。
 *
 * ⚠️ `todayCounted` 必须计入：它代表今天已经挣到、但尚未随跨天落进 `total` 的修为。
 * 漏掉它会出现「今天做完一堆事、修为却纹丝不动，要等明天才涨」——数字与体感直接对不上。
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
  bestRank: number
  bestTitle: string
  bestAt: string | null
} {
  const r = realmOf(0)
  return {
    id: 'cultivation',
    total: 0,
    bonus: 0,
    todayDate: '',
    todayCounted: 0,
    seclusionCount: 0,
    bestRank: r.rank,
    bestTitle: r.title,
    bestAt: null,
  }
}

/**
 * 今日结算（纯函数）—— 把「今日总分」的增量并进累计修为。
 *
 * 两条不变式：
 *  1. **同一天绝不重复累加**：只补 `今日总分 - 今日已计入` 的差额。
 *     当天分数还会继续涨（上午 5 分、晚上 60 分），所以不是"一天记一笔固定的数"，
 *     而是"当天随时补差额"；跨天再把当日计数落进 total 并归零。
 *  2. **只升不降**：今日总分若因撤销操作而变低，差额为负 → 记 0，
 *     已计入的修为不回收（与"境界只升不降"同一条原则）。
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
 * 闭关修为 —— 专门的境界提升方式。
 *
 * 「闭关」= 认领一件今日实事 + 专注一段时长（复用番茄钟，绑定待办的那次专注），
 * 完成才结算。给分刻意高于零散日常：日常是"不修就退"，闭关是"主动精进"，
 * 它才是把境界推上去的主路径。
 *
 * 计法：基础 20 点（肯坐下来本身就是门槛）+ 每 10 分钟 5 点。
 * 25 分钟 ≈ 32 点、60 分钟 ≈ 50 点、90 分钟 ≈ 65 点 —— 一次完整的闭关
 * 约等于半天的道行，与「专门提升方式」的定位相称。
 */
const SECLUSION_BASE = 20
const SECLUSION_PER_10MIN = 5

export function seclusionReward(minutes: number): number {
  const m = Math.max(0, Math.round(minutes))
  return SECLUSION_BASE + Math.floor(m / 10) * SECLUSION_PER_10MIN
}

/** 道行来源分解（行为 → 得分说明，非 RPG 数值，只是记录来源） */
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
