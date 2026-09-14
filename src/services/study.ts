/**
 * 课程表辅助 —— 周次 / 当前周 / 时段冲突
 *
 * 此前的固定时段只有「周几 + 起止时间」，一学期里单双周、前后八周不同课表
 * 完全表达不了，只能手工拆成假课程。现在时段可携带具体周次列表：
 * `weeks` 缺省（或空数组）= 每周都上。
 */
import type { Course, WeeklySlot } from '../types/entities'
import { todayISO } from '../utils/id'

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

/** 展开某课程在指定周几、指定周次下真正要上的时段 */
export function activeSlotsOfDay(
  courses: Course[],
  weekday: number,
  week: number | null,
): { course: Course; slot: WeeklySlot }[] {
  return slotsOfDay(courses, weekday).filter(({ slot }) => slotOnWeek(slot, week))
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
): { course: Course; slot: WeeklySlot; minutesLeft: number }[] {
  return activeSlotsOfDay(courses, weekday, week)
    .map(({ course, slot }) => ({
      course,
      slot,
      minutesLeft: toMinutes(slot.start) - nowMinutes,
    }))
    .filter((x) => Number.isFinite(x.minutesLeft) && x.minutesLeft >= 0 && x.minutesLeft <= aheadMin)
}
