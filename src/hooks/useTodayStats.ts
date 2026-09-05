/**
 * 今日统计 —— 聚合各 store 得到当天数据，供首页「观」与道行计算复用
 */
import { useMemo } from 'react'
import { useBodyMetricLogStore } from '../stores/useBodyStore'
import { useCollectionStore } from '../stores/useCollectionStore'
import { useHabitLogStore } from '../stores/useHabitStore'
import { useJournalStore } from '../stores/useJournalStore'
import { useNoteStore } from '../stores/useNoteStore'
import { usePomodoroStore } from '../stores/usePomodoroStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useTaskStore } from '../stores/useTaskStore'
import { useWaterStore } from '../stores/useWaterStore'
import type { Task } from '../types/entities'
import { diffDays, todayISO, toISODate } from '../utils/id'

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
  journal: ReturnType<typeof useJournalStore.getState>['items'][number] | undefined
  creations: number
}

export function useTodayStats(): TodayStats {
  const tasks = useTaskStore((s) => s.items)
  const waterLogs = useWaterStore((s) => s.items)
  const pomo = usePomodoroStore((s) => s.items)
  const habitLogs = useHabitLogStore((s) => s.items)
  const bodyLogs = useBodyMetricLogStore((s) => s.items)
  const journals = useJournalStore((s) => s.items)
  const notes = useNoteStore((s) => s.items)
  const collections = useCollectionStore((s) => s.items)
  const waterGoal = useSettingsStore((s) => s.waterGoalMl)

  return useMemo<TodayStats>(() => {
    const today = todayISO()
    const todayStart = new Date(`${today}T00:00:00`).getTime()
    const todayEnd = new Date(`${today}T23:59:59`).getTime()

    const tasksDone = tasks.filter(
      (t) => t.done && t.completedAt && new Date(t.completedAt).getTime() >= todayStart,
    ).length
    const tasksOpen = tasks.filter((t) => !t.done).length

    const highPriorityOpen = tasks
      .filter((t) => !t.done && t.priority === 'high')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .slice(0, 5)

    const todayDue = tasks
      .filter((t) => !t.done && t.dueDate && diffDays(t.dueDate) <= 0)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

    const upcoming = tasks
      .filter((t) => !t.done && t.dueDate && diffDays(t.dueDate) >= 1 && diffDays(t.dueDate) <= 3)
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

    const journal = journals.find((j) => j.date === today)

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
      journal,
      creations,
    }
  }, [tasks, waterLogs, pomo, habitLogs, bodyLogs, journals, notes, collections, waterGoal])
}

/** 当前本地日期（yyyy-mm-dd） —— 供组件直接用，避免每处重复 toISODate */
export function useTodayISO(): string {
  return useMemo(() => toISODate(new Date()), [])
}
