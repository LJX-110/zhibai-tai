/** 通用小工具 */
import type { Repeat } from '../types/entities'

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

/* ---------------- 固定任务（每日 / 每周 / 每月）统一判定 ---------------- */

/**
 * 是否「固定任务」。
 *
 * 三式共用一套呈现与交互（待办页的固定分组、完成即记本期），判定收在这里，
 * 让调用方不必各写一遍 `repeat === 'daily' || weeklyDay != null || …`。
 * 每日固定**不需要额外字段** —— "每天"本身没有锚点可言，直接复用 `repeat: 'daily'`，
 * 因此存量数据零迁移。
 */
export function isFixedSchedule(t: {
  repeat: 'none' | 'daily' | 'weekly' | 'monthly'
  monthlyDay?: number | null
  weeklyDay?: number | null
}): boolean {
  return t.repeat === 'daily' || t.monthlyDay != null || t.weeklyDay != null
}

/**
 * 固定任务「本期」是否已做：每日看今天、每周看本周、每月看本月。
 * 同时带锚点时按 每月 > 每周 > 每日 取优先级（与待办页分组的判定顺序一致）。
 * 完成/撤销固定任务都作用在「本期」上，所以交互层只需要这一个判定。
 */
export function fixedDoneThisPeriod(
  t: {
    repeat: 'none' | 'daily' | 'weekly' | 'monthly'
    monthlyDay?: number | null
    weeklyDay?: number | null
    done: boolean
    completedAt?: string | null
  },
  now = new Date(),
): boolean {
  if (t.monthlyDay != null) return monthlyDoneThisMonth(t, now)
  if (t.weeklyDay != null) return weeklyDoneThisWeek(t, now)
  return dailyDoneToday(t, now)
}

/**
 * 每日固定任务：今天是否已做（completedAt 落在**本地**今天）。
 *
 * ⚠️ `completedAt` 是 UTC ISO 串，别用 `slice(0, 10)` 直接当天数比 ——
 * 东八区凌晨 0-8 点那一段会整体差一天。统一转成 Date 再取本地日期。
 */
export function dailyDoneToday(
  t: { done: boolean; completedAt?: string | null },
  now = new Date(),
): boolean {
  if (!t.done || !t.completedAt) return false
  const completed = new Date(t.completedAt)
  if (Number.isNaN(completed.getTime())) return false
  return toISODate(completed) === toISODate(now)
}

/* ------------------------------------------------------------------ *
 * 固定任务的「历史重复」—— 旧版生成后继副本留下的后遗症
 * ------------------------------------------------------------------ */

/** 固定任务的逻辑身份：同一周期锚点 + 同一标题 = 同一件事 */
export function fixedTaskIdentity(t: {
  repeat: Repeat
  monthlyDay?: number | null
  weeklyDay?: number | null
  title: string
}): string {
  return `${t.repeat}|${t.monthlyDay ?? ''}|${t.weeklyDay ?? ''}|${t.title.trim()}`
}

/**
 * 只保留固定任务里的「在世」记录：同一逻辑身份取 `createdAt` 最新的一条。
 *
 * **为什么必须这样取**
 * 旧版完成固定任务时会**额外生成一条后继副本**（同内容、新 id、未完成），而"本期已做"
 * 只看 `completedAt` 落在哪个周期。于是一条「每周固定」会这样膨胀：
 *   第 1 周完成 A → 生成 B；第 2 周 A 的完成时间成了上周 → **A 又被判为"本期未做"**、
 *   与 B 并列出现；第 3 周再生成 C → A+B+C…… **每周多一条，永远复发**。
 * 生成逻辑已在 `hooks/useTaskActions` 堵住（固定任务不再生成后继），但**历史副本还在**，
 * 所以展示层必须只认最新那条 —— 旧副本只是历史，不是待办。
 *
 * 顺序依据：后继副本一定是"更晚创建"的，所以 createdAt 最大者即当前这一条。
 * 非固定任务原样返回（它们本来就是一条记录对应一次完成）。
 */
export function liveFixedTasks<T extends {
  repeat: Repeat
  monthlyDay?: number | null
  weeklyDay?: number | null
  title: string
  createdAt: string
}>(tasks: T[]): T[] {
  const newest = new Map<string, T>()
  const out: T[] = []
  for (const t of tasks) {
    if (!isFixedSchedule(t)) {
      out.push(t)
      continue
    }
    const key = fixedTaskIdentity(t)
    const prev = newest.get(key)
    if (!prev) {
      newest.set(key, t)
      out.push(t)
      continue
    }
    if (t.createdAt > prev.createdAt) {
      // 新的更晚：换掉旧的那条（旧副本从这里退出展示）
      out.splice(out.indexOf(prev), 1, t)
      newest.set(key, t)
    }
    // 否则直接丢弃当前这条（它是更早的副本）
  }
  return out
}

/** 一组同身份的历史重复 */
export interface DuplicateFixedGroup<T> {
  identity: string
  title: string
  /** 该身份下的全部记录（按 createdAt 升序） */
  records: T[]
  /** 建议删除的历史副本：**仅限已完成的旧副本** */
  removable: T[]
}

/**
 * 找出固定任务的历史重复分组。
 *
 * ⚠️ **只把 `done` 的旧副本列为可删**：未完成的记录可能是用户真正还没做的事，
 * 删掉等于凭空抹掉一条待办。宁可少清，不可误删。
 */
export function findDuplicateFixedTasks<T extends {
  id: string
  repeat: Repeat
  monthlyDay?: number | null
  weeklyDay?: number | null
  title: string
  createdAt: string
  done: boolean
}>(tasks: T[]): DuplicateFixedGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const t of tasks) {
    if (!isFixedSchedule(t)) continue
    const key = fixedTaskIdentity(t)
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  const out: DuplicateFixedGroup<T>[] = []
  for (const [identity, list] of groups) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const liveId = sorted[sorted.length - 1].id
    const removable = sorted.filter((t) => t.id !== liveId && t.done)
    if (removable.length === 0) continue
    out.push({ identity, title: sorted[0].title, records: sorted, removable })
  }
  return out
}
