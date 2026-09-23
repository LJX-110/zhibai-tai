/**
 * 课程表辅助 —— 周次 / 当前周 / 时段冲突
 *
 * 此前的固定时段只有「周几 + 起止时间」，一学期里单双周、前后八周不同课表
 * 完全表达不了，只能手工拆成假课程。现在时段可携带具体周次列表：
 * `weeks` 缺省（或空数组）= 每周都上。
 */
import type { Course, CourseCancellation, CourseReschedule, WeeklySlot } from '../types/entities'
import { parseISO, todayISO } from '../utils/id'

/** 一学期默认周数上限（自定义周次输入的合法范围） */
export const MAX_WEEKS = 30

export type WeeksMode = 'all' | 'odd' | 'even' | 'custom'

export interface WeeksForm {
  mode: WeeksMode
  from: number
  to: number
  /** 自定义模式的原始输入（逗号/空格分隔） */
  custom: string
}

/** 周一为起点换算：解析失败或未设置返回 null（表示不过滤周次） */
export function currentWeek(termStartDate: string | undefined, today = todayISO()): number | null {
  if (!termStartDate) return null
  const start = new Date(`${termStartDate}T00:00:00`).getTime()
  const now = new Date(`${today}T00:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null
  const weeks = Math.floor((now - start) / (7 * 864e5)) + 1
  return Math.max(1, weeks)
}

/** 该时段在第 N 周是否上课（week 为 null 表示未设置学期起始日，一律视为上课） */
export function slotOnWeek(slot: WeeklySlot, week: number | null): boolean {
  if (week == null) return true
  if (!slot.weeks || slot.weeks.length === 0) return true
  return slot.weeks.includes(week)
}

function weekSet(slot: WeeklySlot): Set<number> | null {
  return slot.weeks && slot.weeks.length > 0 ? new Set(slot.weeks) : null
}

/** 两个时段是否真的撞车：同一天 + 时间重叠 + 周次有交集（缺省周次视为每周） */
export function slotsOverlap(a: WeeklySlot, b: WeeklySlot): boolean {
  if (a.weekday !== b.weekday) return false
  if (!(a.start < b.end && b.start < a.end)) return false
  const sa = weekSet(a)
  const sb = weekSet(b)
  if (!sa || !sb) return true
  return [...sa].some((w) => sb.has(w))
}

/** 展开某课程在指定周几、指定周次下的时段（不含周次过滤） */
function slotsOfDay(courses: Course[], weekday: number): { course: Course; slot: WeeklySlot }[] {
  return courses
    .flatMap((course) =>
      (course.schedule ?? [])
        .filter((slot) => slot.weekday === weekday)
        .map((slot) => ({ course, slot })),
    )
    .sort((a, b) => a.slot.start.localeCompare(b.slot.start))
}

/**
 * 某一次课是否被单独停掉（按「课程 + 日期 + 开始时间」定位一次课）。
 *
 * **没有 date 一律视为没停** —— 只给「周几 + 周次」时无法定位到具体哪一天，
 * 宁可当作正常上课，也不要凭猜测把课吞掉（漏提醒比多提醒更糟）。
 */
export function isCanceled(
  cancellations: readonly CourseCancellation[] | undefined,
  courseId: string,
  date: string | undefined,
  start: string,
): boolean {
  if (!date || !cancellations?.length) return false
  return cancellations.some((c) => c.courseId === courseId && c.date === date && c.start === start)
}

/**
 * 某一次课被调到了哪里（按「课程 + 日期 + 开始时间」定位，与停课同一把钥匙）。
 *
 * **没有 date 一律视为没调** —— 与 `isCanceled` 同一条纪律：定位不到具体哪一天时，
 * 宁可当作正常上课，也不要凭猜测把课吞掉。
 */
export function rescheduleOf(
  reschedules: readonly CourseReschedule[] | undefined,
  courseId: string,
  date: string | undefined,
  start: string,
): CourseReschedule | undefined {
  if (!date || !reschedules?.length) return undefined
  return reschedules.find((r) => r.courseId === courseId && r.date === date && r.start === start)
}

/**
 * 被**调进**某一天的课 —— 调课的另一半。
 *
 * 调课 = 原时间空掉（由调用方过滤）+ 新时间多出一节（这里）。
 * 造出的时段：weekday 取目标日的周几（`activeSlotsOfDay` 按周几取课，必须对得上），
 * `weeks` 刻意**不设** —— 这次课是"就这一天"，不该被周次过滤再挡一道
 * （原时段的周次只说明它本该在哪一周上，挪过来之后就与周次无关了）。
 */
function movedInSlots(
  courses: Course[],
  date: string,
  reschedules: readonly CourseReschedule[] | undefined,
): { course: Course; slot: WeeklySlot }[] {
  if (!reschedules?.length) return []
  const day = parseISO(date)
  if (Number.isNaN(day.getTime())) return []
  const weekday = day.getDay()
  const out: { course: Course; slot: WeeklySlot }[] = []
  for (const r of reschedules) {
    if (r.toDate !== date) continue
    const course = courses.find((c) => c.id === r.courseId)
    // 课程被删了 → 这次调课无从呈现，静默跳过（与其显示"未知课程"，不如不显示）
    if (!course) continue
    out.push({ course, slot: { weekday, start: r.toStart, end: r.toEnd } })
  }
  return out
}

/**
 * 展开某课程在指定周几、指定周次下真正要上的时段。
 *
 * `opts.date` + `opts.cancellations` 传入时，**已停课的次会被剔除**；
 * 再加 `opts.reschedules` 时还会做两件事：**被调走的次剔除** + **被调进来的次补上**。
 * 这是本项目「取课点」的唯一入口（`check:rules` 规则 4 硬查），
 * 所以课程表、首页今日课程、课堂提醒三处会**同时**正确 —— 不必各自记得处理停课与调课。
 */
export function activeSlotsOfDay(
  courses: Course[],
  weekday: number,
  week: number | null,
  opts: {
    date?: string
    cancellations?: readonly CourseCancellation[]
    reschedules?: readonly CourseReschedule[]
  } = {},
): { course: Course; slot: WeeklySlot }[] {
  const base = slotsOfDay(courses, weekday)
    .filter(({ slot }) => slotOnWeek(slot, week))
    .filter(({ course, slot }) => !isCanceled(opts.cancellations, course.id, opts.date, slot.start))
    .filter(({ course, slot }) => !rescheduleOf(opts.reschedules, course.id, opts.date, slot.start))
  // 调进来的课：没有 date 就无从知道"哪一天"，此时不做补课（宁缺勿错）
  const moved = opts.date
    ? movedInSlots(courses, opts.date, opts.reschedules).filter((x) => x.slot.weekday === weekday)
    : []
  return [...base, ...moved].sort((a, b) => a.slot.start.localeCompare(b.slot.start))
}

/** 表单 → weeks 字段（'all' 返回 undefined，表示每周） */
export function buildWeeks(form: WeeksForm): number[] | undefined {
  if (form.mode === 'all') return undefined
  const from = Math.max(1, Math.min(form.from, MAX_WEEKS))
  const to = Math.max(from, Math.min(form.to, MAX_WEEKS))
  const range: number[] = []
  for (let w = from; w <= to; w++) range.push(w)
  if (form.mode === 'odd') return range.filter((w) => w % 2 === 1)
  if (form.mode === 'even') return range.filter((w) => w % 2 === 0)
  const parsed = form.custom
    .split(/[\s,，、]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_WEEKS)
  return [...new Set(parsed)].sort((a, b) => a - b)
}

/** weeks 字段 → 表单（供编辑回填；无损，能识别单/双周与自定义） */
export function parseWeeksForm(weeks: number[] | undefined): WeeksForm {
  if (!weeks || weeks.length === 0) return { mode: 'all', from: 1, to: 16, custom: '' }
  const sorted = [...new Set(weeks)].sort((a, b) => a - b)
  const from = sorted[0]
  const to = sorted[sorted.length - 1]
  const full: number[] = []
  for (let w = from; w <= to; w++) full.push(w)
  const isOdd = sorted.every((w) => w % 2 === 1)
  const isEven = sorted.every((w) => w % 2 === 0)
  const isContiguousOdd = isOdd && sorted.length === full.filter((w) => w % 2 === 1).length
  const isContiguousEven = isEven && sorted.length === full.filter((w) => w % 2 === 0).length
  if (isContiguousOdd) return { mode: 'odd', from, to, custom: '' }
  if (isContiguousEven) return { mode: 'even', from, to, custom: '' }
  return { mode: 'custom', from, to, custom: sorted.join(',') }
}

/** 周次的人话描述 */
export function describeWeeks(weeks: number[] | undefined): string {
  if (!weeks || weeks.length === 0) return '每周'
  const form = parseWeeksForm(weeks)
  if (form.mode === 'odd') return `单周 ${form.from}-${form.to}`
  if (form.mode === 'even') return `双周 ${form.from}-${form.to}`
  return `第 ${weeks.join('、')} 周`
}

/** "HH:MM" → 当日分钟数（非法输入返回 NaN） */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN
  return h * 60 + m
}

/**
 * 即将开始的课（纯函数，便于单测）。
 * @param nowMinutes 当日已过分钟数（时 × 60 + 分）
 * @param aheadMin   提前多少分钟提醒
 */
export function upcomingClasses(
  courses: Course[],
  weekday: number,
  week: number | null,
  nowMinutes: number,
  aheadMin = 15,
  opts: {
    date?: string
    cancellations?: readonly CourseCancellation[]
    reschedules?: readonly CourseReschedule[]
  } = {},
): { course: Course; slot: WeeklySlot; minutesLeft: number }[] {
  return activeSlotsOfDay(courses, weekday, week, opts)
    .map(({ course, slot }) => ({
      course,
      slot,
      minutesLeft: toMinutes(slot.start) - nowMinutes,
    }))
    .filter((x) => Number.isFinite(x.minutesLeft) && x.minutesLeft >= 0 && x.minutesLeft <= aheadMin)
}

/**
 * 第 `week` 周的周几 → 具体日期（yyyy-mm-dd）。
 *
 * 停课按**日期**定位，而周视图每个格子只有「周几 + 第几周」，
 * 所以要把格子换算成日期，才能问「这一格里的课停了吗」。
 * 学期起始日缺失或周次未知 → null（调用方据此不做停课判断：宁可不标，也不错标）。
 */
export function dateOfWeekday(
  termStartDate: string | undefined,
  week: number | null,
  weekday: number,
): string | null {
  if (!termStartDate || week == null || week < 1) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(termStartDate)
  if (!m) return null
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(start.getTime())) return null
  // 第 1 周的周一 = 起始日所在周的周一（与 currentWeek 的口径一致）
  const dow = start.getDay() // 0=周日
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((dow + 6) % 7))
  const target = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + (week - 1) * 7 + ((weekday + 6) % 7),
  )
  const pad = (n: number) => String(n).padStart(2, '0')
  return [target.getFullYear(), pad(target.getMonth() + 1), pad(target.getDate())].join('-')
}

/**
 * 一天的课，**带「是否被停 / 是否被调走 / 是否调来的」标记**。
 *
 * 课程表与"该上几节课"是两种需求：
 *  · 课程表要**显示**停掉与调走的课（并让用户能恢复）—— 直接隐藏会让人以为课表丢了；
 *  · 统计与提醒要**排除**它们 —— 否则就是「取消了还提醒」「调走了还在原来那节提醒」。
 * 所以这里给出带标记的完整列表，`activeSlotsOfDay` 是它的过滤版（DRY）。
 *
 * 另外**补上被调进来的课**（`movedIn = true`）：调课之后新时间那一节必须能在
 * 课程表里看见，否则用户只知道"周三那节没了"。
 */
export function daySlotsDetailed(
  courses: Course[],
  weekday: number,
  week: number | null,
  date: string | null,
  cancellations: readonly CourseCancellation[] | undefined,
  reschedules?: readonly CourseReschedule[],
): {
  course: Course
  slot: WeeklySlot
  canceled: boolean
  /** 被调到哪里（null = 没被调走） */
  movedTo: CourseReschedule | null
  /** 是不是"从别处调来的"这一节 */
  movedIn: boolean
}[] {
  const base = slotsOfDay(courses, weekday)
    .filter(({ slot }) => slotOnWeek(slot, week))
    .map(({ course, slot }) => ({
      course,
      slot,
      canceled: isCanceled(cancellations, course.id, date ?? undefined, slot.start),
      movedTo: rescheduleOf(reschedules, course.id, date ?? undefined, slot.start) ?? null,
      movedIn: false,
    }))
  const moved = date
    ? movedInSlots(courses, date, reschedules)
        .filter((x) => x.slot.weekday === weekday)
        .map(({ course, slot }) => ({ course, slot, canceled: false, movedTo: null, movedIn: true }))
    : []
  return [...base, ...moved].sort((a, b) => a.slot.start.localeCompare(b.slot.start))
}
