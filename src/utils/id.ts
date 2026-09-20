/** 通用小工具 */

/** 生成唯一 id */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 当前本地日期 yyyy-mm-dd */
export function todayISO(): string {
  const d = new Date()
  return toISODate(d)
}

/** Date → yyyy-mm-dd（本地时区） */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 偏移天数：今天 ±n */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return toISODate(dt)
}

/** yyyy-mm-dd → Date（本地） */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 友好显示日期：今天/明天/昨天 或 M月D日 星期X */
export function friendlyDate(iso: string): string {
  const today = todayISO()
  if (iso === today) return '今天'
  if (iso === shiftDate(today, 1)) return '明天'
  if (iso === shiftDate(today, -1)) return '昨天'
  const d = parseISO(iso)
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
}

/** 与今天相差天数（负数=已过期） */
export function diffDays(iso: string): number {
  const t = parseISO(todayISO()).getTime()
  const d = parseISO(iso).getTime()
  return Math.round((d - t) / 86400000)
}

/** 当前时刻的 ISO 字符串 —— 全库统一的"现在"（写库 / 导出用），
 *  避免各处各写一遍 new Date().toISOString()（全库曾有 40 处） */
export function nowISO(): string {
  return new Date().toISOString()
}

/** 今天星期几（0=周日 … 6=周六），与 weekdayCN / 课程表 weekday 同构 */
export function todayWeekday(): number {
  return new Date().getDay()
}

/** 当前时间 HH:mm */
export function nowHM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** ISO 时间 → HH:mm */
export function formatHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 星期中文 */
export function weekdayCN(weekday: number): string {
  return ['日', '一', '二', '三', '四', '五', '六'][weekday]
}

/* ---------------- 每月固定任务（每月 N 号提醒） ---------------- */

/** 本月是否已完成（completedAt 落在当月 YYYY-MM） */
export function monthlyDoneThisMonth(
  t: { done: boolean; completedAt?: string | null },
  now = new Date(),
): boolean {
  if (!t.done || !t.completedAt) return false
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return t.completedAt.slice(0, 7) === ym
}

/** 每月固定任务：今天是否到期（今天 = 每月 N 号） */
export function monthlyDueToday(
  t: { monthlyDay?: number | null },
  now = new Date(),
): boolean {
  return t.monthlyDay != null && t.monthlyDay === now.getDate()
}

/* ---------------- 每周固定任务（每周 X 提醒） ---------------- */

/**
 * 本周是否已完成（completedAt 落在本周一 00:00 起的一周内）。
 * 一周以「周一」为始：与国内作息一致，也对齐 ISO 周；
 * 用 getDay() 推周一时借其「0=周日」特性 —— (dow + 6) % 7 即距周一的天数，
 * 与 weeklyDay 取值域（0=周日…6=周六）同一套，不引入第二套编号。
 */
export function weeklyDoneThisWeek(
  t: { done: boolean; completedAt?: string | null },
  now = new Date(),
): boolean {
  if (!t.done || !t.completedAt) return false
  const completed = new Date(t.completedAt)
  if (Number.isNaN(completed.getTime())) return false
  // 取某日所在周的周一 00:00（本地）
  const mondayOf = (d: Date) => {
    const dow = d.getDay() // 0=周日…6=周六
    const diff = (dow + 6) % 7 // 周日→6, 周一→0, …, 周六→5
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
  }
  return mondayOf(completed).getTime() === mondayOf(now).getTime()
}

/** 每周固定任务：今天是否到期（今天 = 每周 X；weeklyDay 用 0=周日 约定） */
export function weeklyDueToday(
  t: { weeklyDay?: number | null },
  now = new Date(),
): boolean {
  return t.weeklyDay != null && t.weeklyDay === now.getDay()
}
