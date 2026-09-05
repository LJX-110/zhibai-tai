/**
 * usePomodoroTimerStore —— 全局番茄钟计时状态（V1.1 全局化）
 * 学页 / Focus Mode / 顶栏芯片共用同一计时；归零结算在此统一处理
 */
import { create } from 'zustand'
import { useSettingsStore } from './useSettingsStore'
import { usePomodoroStore } from './usePomodoroStore'
import { useTaskStore } from './useTaskStore'
import { useCourseStore } from './useStudyStore'
import { useProjectStore } from './useProjectStore'
import { recordActivity } from '../services/activity'
import { playSound } from '../services/sound'
import { createId } from '../utils/id'

export type PomodoroAssoc = 'none' | 'task' | 'course' | 'project'

export interface PomodoroTimerState {
  mode: 'focus' | 'break'
  seconds: number
  running: boolean
  focusStart: string | null
  assoc: PomodoroAssoc
  assocId: string
  start: () => void
  pause: () => void
  reset: () => void
  setAssoc: (a: PomodoroAssoc, id: string) => void
  setMode: (m: 'focus' | 'break') => void
  /** 每秒推进；归零时结算并切换 专注/休整 */
  tick: () => void
}

function durationSec(mode: 'focus' | 'break'): number {
  const s = useSettingsStore.getState()
  return (mode === 'focus' ? s.pomodoroFocusMin : s.pomodoroBreakMin) * 60
}

export const usePomodoroTimerStore = create<PomodoroTimerState>((set, get) => ({
  mode: 'focus',
  seconds: durationSec('focus'),
  running: false,
  focusStart: null,
  assoc: 'none',
  assocId: '',

  start() {
    const st = get()
    if (st.seconds === 0) set({ seconds: durationSec(st.mode) })
    if (st.mode === 'focus' && !st.focusStart) set({ focusStart: new Date().toISOString() })
    set({ running: true })
  },

  pause() {
    set({ running: false })
  },

  reset() {
    set({ running: false, seconds: durationSec(get().mode), focusStart: null })
  },

  setAssoc(a, id) {
    set({ assoc: a, assocId: id })
  },

  setMode(m) {
    set({ mode: m, seconds: durationSec(m), running: false, focusStart: null })
  },

  tick() {
    const st = get()
    if (!st.running) return
    const sec = st.seconds - 1
    if (sec > 0) {
      set({ seconds: sec })
      return
    }
    // 归零 → 结算本段
    if (st.mode === 'focus' && st.focusStart) {
      const focusMin = useSettingsStore.getState().pomodoroFocusMin
      const now = new Date()
      const tag =
        st.assoc === 'task'
          ? '任务'
          : st.assoc === 'course'
            ? '课程'
            : st.assoc === 'project'
              ? '项目'
              : '普通'
      const session = {
        id: createId(),
        startAt: st.focusStart,
        endAt: now.toISOString(),
        durationMin: focusMin,
        type: 'focus' as const,
        courseId: st.assoc === 'course' ? st.assocId || null : null,
        taskId: st.assoc === 'task' ? st.assocId || null : null,
        projectId: st.assoc === 'project' ? st.assocId || null : null,
        tags: [tag],
      }
      void usePomodoroStore.getState().add(session)
      const name = session.taskId
        ? useTaskStore.getState().items.find((t) => t.id === session.taskId)?.title
        : session.courseId
          ? useCourseStore.getState().items.find((c) => c.id === session.courseId)?.name
          : session.projectId
            ? useProjectStore.getState().items.find((p) => p.id === session.projectId)?.name
            : undefined
      void recordActivity({
        entityType: 'pomodoro',
        entityId: session.id,
        title: name ? `专注 ${focusMin} 分钟 · ${name}` : `专注 ${focusMin} 分钟`,
      })
      playSound('success')
    }
    const next: 'focus' | 'break' = st.mode === 'focus' ? 'break' : 'focus'
    set({ mode: next, seconds: durationSec(next), running: false, focusStart: null })
  },
}))
