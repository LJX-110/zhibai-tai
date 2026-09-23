/**
 * 今日统计 —— 聚合各 store 得到当天数据，供首页「观」与今日炁象计算复用
 */
import { useEffect, useMemo, useState } from 'react'
import { useBodyMetricLogStore } from '../stores/useBodyStore'
import { useCollectionStore } from '../stores/useCollectionStore'
import { useHabitLogStore } from '../stores/useHabitStore'
import { useNoteStore } from '../stores/useNoteStore'
import { usePomodoroStore } from '../stores/usePomodoroStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useTaskStore } from '../stores/useTaskStore'
import { useWaterStore } from '../stores/useWaterStore'
import type { Task } from '../types/entities'
import { diffDays, effectiveDone, liveFixedTasks, toISODate } from '../utils/id'

export interface TodayStats {
  date: string
  tasksDone: number
  tasksOpen: number
  /** 今日完成的高优先级待办 */
  highPriorityOpen: Task[]
  /** 待办（含今日到期与已过期） */
  todayDue: Task[]
  /** 3 天内到期 */
  upcoming: Task[]
  focusMinutes: number
  focusSessions: number
  waterMl: number
  waterRatio: number
  habitLogs: number
  bodyLogs: number
  /** 今日新增的记录类笔记数（今日炁象「心」维的数据源） */
  notesToday: number
  creations: number
}

export function useTodayStats(): TodayStats {
  const tasks = useTaskStore((s) => s.items)
  const waterLogs = useWaterStore((s) => s.items)
  const pomo = usePomodoroStore((s) => s.items)
  const habitLogs = useHabitLogStore((s) => s.items)
  const bodyLogs = useBodyMetricLogStore((s) => s.items)
  const notes = useNoteStore((s) => s.items)
  const collections = useCollectionStore((s) => s.items)
  const waterGoal = useSettingsStore((s) => s.waterGoalMl)
  // 参与依赖：跨午夜后每分钟翻新，让下方统计随日期自动重算
  const today = useTodayISO()

  return useMemo<TodayStats>(() => {
    const todayStart = new Date(`${today}T00:00:00`).getTime()
    const todayEnd = new Date(`${today}T23:59:59`).getTime()

    /* 两个口径都要对，缺一不可：
       ① **先取在世记录** —— 旧版生成的后继副本已被展示层隐藏，但物理上还在库里；
          不先过一遍 `liveFixedTasks`，这些看不见的副本会照样进计数（"待办 N 项"虚高）。
       ② **完成态走 effectiveDone** —— 固定任务（每日/每周/每月）只有一条记录、
          `done` 跨期不重置；读裸字段的话，上周做完的「每日固定」今天就不算待办了，
          而界面上它的勾又是按本期判的，两边对不上。 */
    const live = liveFixedTasks(tasks)
    const tasksDone = live.filter(
      (t) => effectiveDone(t) && t.completedAt && new Date(t.completedAt).getTime() >= todayStart,
    ).length
    const tasksOpen = live.filter((t) => !effectiveDone(t)).length

    const highPriorityOpen = live
      .filter((t) => !effectiveDone(t) && t.priority === 'high')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .slice(0, 5)

    const todayDue = live
      .filter((t) => !effectiveDone(t) && t.dueDate && diffDays(t.dueDate) <= 0)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

    const upcoming = live
      .filter((t) => !effectiveDone(t) && t.dueDate && diffDays(t.dueDate) >= 1 && diffDays(t.dueDate) <= 3)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

    const focus = pomo.filter((p) => {
      const t = new Date(p.startAt).getTime()
      return p.type === 'focus' && t >= todayStart && t <= todayEnd
    })
    const focusMinutes = focus.reduce((s, p) => s + p.durationMin, 0)
    const focusSessions = focus.length

    const waterMl = waterLogs
      .filter((w) => w.date === today)
      .reduce((s, w) => s + w.amountMl, 0)
    const waterRatio = waterGoal > 0 ? Math.min(1, waterMl / waterGoal) : 0

    const habitLogsToday = habitLogs.filter((l) => l.date === today).length
    const bodyLogsToday = bodyLogs.filter((l) => l.date === today).length

    const notesToday = notes.filter(
      (n) => new Date(n.createdAt).getTime() >= todayStart && n.kind === 'note',
    ).length

    const creations =
      notes.filter(
        (n) => new Date(n.createdAt).getTime() >= todayStart && n.kind === 'inspiration',
      ).length +
      collections.filter((c) => new Date(c.createdAt).getTime() >= todayStart).length

    return {
      date: today,
      tasksDone,
      tasksOpen,
      highPriorityOpen,
      todayDue,
      upcoming,
      focusMinutes,
      focusSessions,
      waterMl,
      waterRatio,
      habitLogs: habitLogsToday,
      bodyLogs: bodyLogsToday,
      notesToday,
      creations,
    }
  }, [tasks, waterLogs, pomo, habitLogs, bodyLogs, notes, collections, waterGoal, today])
}

/** 当前本地日期（yyyy-mm-dd） —— 每分钟滚动一次，跨午夜后自动翻新；
 *  此前 useMemo(()=>…,[]) 固定首次渲染值，应用挂机过午夜统计与"今日"不再更新 */
function useTodayISO(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return toISODate(now)
}
