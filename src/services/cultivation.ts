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
