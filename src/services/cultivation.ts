/**
 * 道行服务 —— 由近期行为综合得出的轨迹分
 * Phase 1：简单权重模型，不做复杂算法；接口预留后续扩展
 *
 * 五维：行 / 学 / 身 / 心 / 创
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
  /** 今日是否有日省 */
  journalToday: boolean
  /** 今日心情 0-5 */
  journalMood?: number
  /** 今日新增创作（笔记/灵感/收藏） */
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
  const xin = input.journalToday ? (input.journalMood != null && input.journalMood >= 3 ? MAX : 12) : 0
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

/** 道行等级描述（克制，非 RPG 段位） */
export function cultivationGrade(total: number): { title: string; desc: string } {
  if (total >= 80) return { title: '入境', desc: '今日诸事合宜，气机顺畅' }
  if (total >= 60) return { title: '得法', desc: '今日行之有效，略有进益' }
  if (total >= 40) return { title: '守常', desc: '今日中规中矩，尚需用心' }
  if (total >= 20) return { title: '积微', desc: '今日所积甚少，宜加把劲' }
  return { title: '虚静', desc: '今日无事可记，养精蓄锐亦可' }
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
  if (input.journalToday) add('日省', input.journalMood != null && input.journalMood >= 3 ? 20 : 12)
  add('创作', Math.min(input.creationsToday, 4) * 5)
  return out
}

/** 逐日道行输入（供历史曲线） */
export interface DailyCultivationInput {
  tasks: { done: boolean; completedAt?: string | null }[]
  pomodoroSessions: { type: 'focus' | 'break'; startAt: string; durationMin: number }[]
  waterLogs: { date: string; amountMl: number }[]
  habitLogs: { date: string }[]
  bodyMetricLogs: { date: string }[]
  journals: { date: string; mood?: number }[]
  notes: { kind: 'note' | 'inspiration'; createdAt: string }[]
  collections: { createdAt: string }[]
  waterGoal: number
}

/** 计算某日道行总分（0-100） */
export function computeDailyCultivation(date: string, input: DailyCultivationInput): number {
  const {
    tasks,
    pomodoroSessions,
    waterLogs,
    habitLogs,
    bodyMetricLogs,
    journals,
    notes,
    collections,
    waterGoal,
  } = input

  const tasksDone = tasks.filter(
    (t) => t.done && t.completedAt?.startsWith(date),
  ).length
  const focusMinutes = pomodoroSessions
    .filter((p) => p.type === 'focus' && p.startAt.startsWith(date))
    .reduce((s, p) => s + p.durationMin, 0)
  const waterMl = waterLogs
    .filter((w) => w.date === date)
    .reduce((s, w) => s + w.amountMl, 0)
  const journal = journals.find((j) => j.date === date)
  const creations =
    notes.filter((n) => n.kind === 'inspiration' && n.createdAt.startsWith(date)).length +
    collections.filter((c) => c.createdAt.startsWith(date)).length

  return computeCultivation({
    tasksDoneToday: tasksDone,
    focusMinutesToday: focusMinutes,
    waterRatio: waterGoal > 0 ? Math.min(1, waterMl / waterGoal) : 0,
    habitLogsToday: habitLogs.filter((l) => l.date === date).length,
    bodyLogsToday: bodyMetricLogs.filter((l) => l.date === date).length,
    journalToday: Boolean(journal),
    journalMood: journal?.mood,
    creationsToday: creations,
  }).total
}
