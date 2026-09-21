/**
 * 统一提醒引擎 —— 「现在该提醒什么」的唯一判定源（纯函数，不读 store）
 *
 * 为什么收口
 * ----------
 * 此前"该不该提醒"散在两处（`NotificationGate` 的开局扫描、`ClassReminder` 的每分钟 tick），
 * 规则重复（免打扰 / 去重 / 记历史各写一遍），且盲区成片：作业与考试**零通知**、
 * 固定任务三式**零通知**、待办的去重键粗到「当天新增的事项不再提醒」。
 *
 * 设计
 * ----
 *  · **纯函数**：`collectReminders(快照, now)` 算出"此刻该提醒的每一项"，不读 store、不落库，
 *    可以直接单测（错提醒的代价是"半夜被吵醒 / 要交的没提醒"，这类错误必须在纯函数层锁死）。
 *  · **细粒度去重键**：键细到「项 + 期间」。当天新建的到期事项，它的键还没被认领，
 *    当次就会提醒 —— 这是旧版单一 `'tasks'` 键做不到的。
 *  · **分组呈现**：同 kind 合成一条提示（标题列表），但认领仍按项；
 *    组内出现任何新的未认领项就整组重发一次。既不一次弹十条，又不漏新事项。
 *  · **两个出口同一份数据**：应用内 toast 与系统通知消费同一个 `Reminder[]`。
 *    系统通知只发给 `critical` 项（每轮有上限），避免开局 flood。
 *
 * 免打扰是**投递策略**不是提醒事实，由调度器（ReminderEngine）套用，这里不管。
 */
import type { Course, Exam, Habit, HabitLog, Homework, Task, WaterLog } from '../types/entities'
import { currentWeek, activeSlotsOfDay, upcomingClasses } from './study'
import {
  fixedDoneThisPeriod,
  isFixedSchedule,
  monthlyDueToday,
  toISODate,
  weeklyDueToday,
} from '../utils/id'

export type ReminderKind =
  | 'tasks'
  | 'fixed'
  | 'class-ahead'
  | 'classes'
  | 'homeworks'
  | 'exams'
  | 'habits'
  | 'water'

export type ReminderTone = 'info' | 'danger'

export interface DueReminder {
  /** 去重键，细到「项 + 期间」 */
  key: string
  /** 所属期间（今天 / 本周一 / 本月），认领存储按它判定过期 */
  period: string
  kind: ReminderKind
  title: string
  /** 点击后的跳转目标（与系统通知深链共用同一套 hash） */
  hash: string
  tone: ReminderTone
  /** 值得发系统通知（逾期 / 马上上课 / 明天考试……）；其余只进应用内 */
  critical: boolean
}

/** 快照：调度器从 store 现取，这里只看数据不碰状态 */
export interface ReminderSnapshot {
  tasks: Task[]
  courses: Course[]
  homeworks: Homework[]
  exams: Exam[]
  habits: Habit[]
  habitLogs: HabitLog[]
  waterLogs: WaterLog[]
  waterGoalMl: number
  /** 学期起始日（缺省时，带周次的课无从判断该不该上） */
  termStartDate?: string
}

/** 各分组的呈现名（调度器拼提示用） */
export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  tasks: '待办提醒',
  fixed: '今日固定',
  'class-ahead': '即将上课',
  classes: '课程概览',
  homeworks: '作业提醒',
  exams: '考试提醒',
  habits: '习惯提醒',
  water: '喝水提醒',
}

/** 分组呈现顺序：越急的越靠前 */
const KIND_ORDER: ReminderKind[] = [
  'class-ahead',
  'exams',
  'homeworks',
  'tasks',
  'fixed',
  'classes',
  'habits',
  'water',
]

/* ------------------------------------------------------------------ *
 * 去重存储在 ./reminder-claims.ts（键自带期间，认领按「键 + 期间」判定）
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 各提醒源
 * ------------------------------------------------------------------ */

/** 待办：今日到期 + 逾期。细到每一项 —— 当天新建的到期事项当次就会提醒 */
export function taskReminders(tasks: Task[], today: string): DueReminder[] {
  const out: DueReminder[] = []
  for (const t of tasks) {
    if (t.done || !t.dueDate) continue
    if (t.dueDate < today) {
      out.push({
        key: `task:overdue:${t.id}:${t.dueDate}`,
        period: today,
        kind: 'tasks',
        title: `${t.title}（已逾期）`,
        hash: '#/action',
        tone: 'danger',
        critical: true,
      })
    } else if (t.dueDate === today) {
      out.push({
        key: `task:today:${t.id}`,
        period: today,
        kind: 'tasks',
        title: t.title,
        hash: '#/action',
        tone: 'info',
        critical: false,
      })
    }
  }
  return out
}

/**
 * 固定任务三式：**今天到期**且本期未做才提醒。
 * 每月 27 号的事在今天（20 号）只该出现在清单里，不该响 ——
 * 提醒看"今天是不是到期日"，清单看"本期做没做"，两者是两回事。
 */
export function fixedReminders(tasks: Task[], now: Date): DueReminder[] {
  const today = toISODate(now)
  const out: DueReminder[] = []
  for (const t of tasks) {
    if (!isFixedSchedule(t) || fixedDoneThisPeriod(t, now)) continue
    const dueToday =
      t.monthlyDay != null
        ? monthlyDueToday(t, now)
        : t.weeklyDay != null
          ? weeklyDueToday(t, now)
          : true // 每日固定没有"哪天到期"一说
    if (!dueToday) continue
    const period = t.weeklyDay != null ? weekKeyOf(now) : t.monthlyDay != null ? today.slice(0, 7) : today
    out.push({
      key: `fixed:${t.repeat}:${t.id}:${period}`,
      period,
      kind: 'fixed',
      title: t.title,
      hash: '#/action',
      tone: 'info',
      critical: false,
    })
  }
  return out
}

/** 本周键（周一为一周之始，与 weeklyDoneThisWeek 的算法同源） */
function weekKeyOf(now: Date): string {
  const x = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - diff)
  return `w${toISODate(x)}`
}

/**
 * 课程：提前量提醒 + 当日概览。
 *  · ahead：进入提前量窗口的每一节课，键细到「课 + 开始时间 + 日期」；
 *  · overview：今天还有课没上时给一句概览（今天全上完就不报 ——
 *    旧版用 `?? todayClasses[0]` 兜底，把第一节当"下一节"再报一次，晚上打开就看到早八）。
 *
 * 未设学期起始日时，带周次的课无从判断该不该上 —— 宁可漏报也不错报
 * （用户反馈过「这周不上却仍提醒」），与旧 ClassReminder 的兜底一致。
 */
export function classReminders(
  courses: Course[],
  termStartDate: string | undefined,
  now: Date,
  aheadMin = 15,
): DueReminder[] {
  const today = toISODate(now)
  const week = currentWeek(termStartDate, today)
  const weekday = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const out: DueReminder[] = []

  for (const { course, slot, minutesLeft } of upcomingClasses(courses, weekday, week, minutes, aheadMin)) {
    if (week == null && slot.weeks?.length) continue
    out.push({
      key: `class:${course.id}:${slot.start}:${today}`,
      period: today,
      kind: 'class-ahead',
      title: `${course.name} ${minutesLeft <= 0 ? '即将开始' : `${minutesLeft} 分钟后`}${course.room ? ` · ${course.room}` : ''}`,
      hash: '#/study',
      tone: 'danger',
      critical: true,
    })
  }

  // 当日概览：今天还有课没上时给一句"下一节"。今天全上完就不报 ——
  // 旧版用 `?? todayClasses[0]` 兜底，把第一节当"下一节"再报一次，晚上打开就看到早八
  const dayClasses = activeSlotsOfDay(courses, weekday, week)
  const next = dayClasses
    .map(({ course, slot }) => ({ name: course.name, start: slot.start }))
    .sort((a, b) => a.start.localeCompare(b.start))
    .find((c) => c.start > hhmm)
  if (dayClasses.length > 0 && next) {
    out.push({
      key: `classes:overview:${today}`,
      period: today,
      kind: 'classes',
      title: `今日 ${dayClasses.length} 节课 · 下一节 ${next.name} ${next.start}`,
      hash: '#/study',
      tone: 'info',
      critical: false,
    })
  }
  return out
}

/** 作业：已逾期的，以及今明两天截止且未交的 */
export function homeworkReminders(homeworks: Homework[], today: string): DueReminder[] {
  const out: DueReminder[] = []
  for (const hw of homeworks) {
    if (hw.done || !hw.dueDate) continue
    const left = Math.round((Date.parse(`${hw.dueDate}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000)
    if (!Number.isFinite(left)) continue
    if (left < 0) {
      out.push({
        key: `hw:overdue:${hw.id}:${hw.dueDate}`,
        period: today,
        kind: 'homeworks',
        title: `${hw.title}（逾期 ${-left} 天）`,
        hash: '#/study',
        tone: 'danger',
        critical: true,
      })
    } else if (left <= 1) {
      out.push({
        key: `hw:due:${hw.id}:${hw.dueDate}`,
        period: today,
        kind: 'homeworks',
        title: `${hw.title}（${left === 0 ? '今天' : '明天'}截止）`,
        hash: '#/study',
        tone: left === 0 ? 'danger' : 'info',
        critical: left === 0,
      })
    }
  }
  return out
}

/** 考试：只剩 3 天 / 1 天 / 当天，各提醒一次（键含剩余天数，天然每日一次） */
export function examReminders(exams: Exam[], today: string): DueReminder[] {
  const out: DueReminder[] = []
  for (const exam of exams) {
    const left = Math.round((Date.parse(`${exam.date}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000)
    if (!Number.isFinite(left)) continue
    if (left !== 3 && left !== 1 && left !== 0) continue
    const when = left === 0 ? '今天' : left === 1 ? '明天' : '三天后'
    out.push({
      key: `exam:${exam.id}:d${left}`,
      period: today,
      kind: 'exams',
      title: `${exam.title}（${when}考试${exam.location ? ` · ${exam.location}` : ''}）`,
      hash: '#/study',
      tone: left <= 1 ? 'danger' : 'info',
      critical: left <= 1,
    })
  }
  return out
}

/**
 * 习惯：过了晚间门槛仍未达标才提醒（早上提醒是催，晚上提醒是收尾）。
 * 门槛定为 21:00 —— 一天结束前还有时间补救，又不至于在白天反复打扰。
 */
const HABIT_GATE_HM = '21:00'

export function habitReminders(
  habits: Habit[],
  logs: HabitLog[],
  now: Date,
  gateHM = HABIT_GATE_HM,
): DueReminder[] {
  const today = toISODate(now)
  if (!pastGate(now, gateHM)) return []
  const out: DueReminder[] = []
  for (const h of habits) {
    const done = logs.filter((l) => l.habitId === h.id && l.date === today).reduce((s, l) => s + l.count, 0)
    if (done >= h.targetPerDay) continue
    out.push({
      key: `habit:${h.id}:${today}`,
      period: today,
      kind: 'habits',
      title: `${h.name}（${done}/${h.targetPerDay}${h.unit ?? ''}）`,
      hash: '#/cultivate',
      tone: 'info',
      critical: false,
    })
  }
  return out
}

/**
 * 喝水：过了晚间门槛仍未达标才提醒一次（同习惯的门槛逻辑）。
 */
const WATER_GATE_HM = '21:00'

export function waterReminders(
  logs: WaterLog[],
  goalMl: number,
  now: Date,
  gateHM = WATER_GATE_HM,
): DueReminder[] {
  const today = toISODate(now)
  if (!pastGate(now, gateHM)) return []
  if (goalMl <= 0) return []
  const drank = logs.filter((l) => l.date === today).reduce((s, l) => s + l.amountMl, 0)
  if (drank >= goalMl) return []
  const short = goalMl - drank
  return [
    {
      key: `water:${today}`,
      period: today,
      kind: 'water',
      title: `今天还差 ${short}ml 水（${drank}/${goalMl}）`,
      hash: '#/cultivate',
      tone: 'info',
      critical: false,
    },
  ]
}

/** "HH:MM" → 当日分钟数（非法输入按 0 处理，与 isQuietNow 同一套容忍度） */
function hmToMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

function hmStringToMinutes(v: string): number {
  const [h, m] = v.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** 门槛比较：now 是否已过门槛时刻 */
function pastGate(now: Date, gateHM: string): boolean {
  return hmToMinutes(now) >= hmStringToMinutes(gateHM)
}

/* ------------------------------------------------------------------ *
 * 汇总
 * ------------------------------------------------------------------ */

/** 汇总所有提醒源。顺序即呈现顺序（越急越前）。 */
export function collectReminders(snap: ReminderSnapshot, now: Date, aheadMin = 15): DueReminder[] {
  const today = toISODate(now)
  return [
    ...classReminders(snap.courses, snap.termStartDate, now, aheadMin),
    ...examReminders(snap.exams, today),
    ...homeworkReminders(snap.homeworks, today),
    ...taskReminders(snap.tasks, today),
    ...fixedReminders(snap.tasks, now),
    ...habitReminders(snap.habits, snap.habitLogs, now),
    ...waterReminders(snap.waterLogs, snap.waterGoalMl, now),
  ].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
}
