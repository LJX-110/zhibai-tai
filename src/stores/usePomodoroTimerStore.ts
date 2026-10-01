/**
 * usePomodoroTimerStore —— 全局番茄钟计时状态
 * 学页 / Focus Mode / 顶栏芯片共用同一计时；归零结算在此统一处理
 */
import { create } from 'zustand'
import { useSettingsStore } from './useSettingsStore'
import { usePomodoroStore } from './usePomodoroStore'
import { useTaskStore } from './useTaskStore'
import { useCourseStore } from './useStudyStore'
import { useProjectStore } from './useProjectStore'
import { useCultivationStore } from './useCultivationStore'
import { recordActivity } from '../services/activity'
import { playSound } from '../services/sound'
import { createId } from '../utils/id'
import { emitCompletion } from '../services/completion'

export type PomodoroAssoc = 'none' | 'task' | 'course' | 'project'

export interface PomodoroTimerState {
  mode: 'focus' | 'break'
  seconds: number
  running: boolean
  focusStart: string | null
  assoc: PomodoroAssoc
  assocId: string
  /**
   * 本次专注/闭关的**自由文本内容**（Step 5-3C）。
   *
   * 此前闭关只能从待办里认领 —— "今天练两小时 Python""读完某篇资料"这类
   * **没有对应待办的事**就无从下手，而它们恰恰是最常见的形式。
   * 现在它是与 `assocId` 并列的一等字段：有内容即算一次闭关（见 `tick` 的结算判据）。
   */
  assocLabel: string
  start: () => void
  pause: () => void
  reset: () => void
  setAssoc: (a: PomodoroAssoc, id: string) => void
  setAssocLabel: (label: string) => void
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
  assocLabel: '',

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
    // 中断半程记录：专注中重置视为放弃，已专注 ≥5 分钟落一条"中断"Session，
    // 否则长专注被随手清零、数据失真（暂停后再重置同样算放弃）
    const st = get()
    if (st.mode === 'focus' && st.focusStart) {
      const elapsedMin = Math.floor((Date.now() - new Date(st.focusStart).getTime()) / 60_000)
      if (elapsedMin >= 5) {
        const tag =
          st.assoc === 'task'
            ? '任务'
            : st.assoc === 'course'
              ? '课程'
              : st.assoc === 'project'
                ? '项目'
                : '普通'
        void usePomodoroStore.getState().add({
          id: createId(),
          startAt: st.focusStart,
          endAt: new Date().toISOString(),
          durationMin: elapsedMin,
          type: 'focus',
          courseId: st.assoc === 'course' ? st.assocId || null : null,
          taskId: st.assoc === 'task' ? st.assocId || null : null,
          projectId: st.assoc === 'project' ? st.assocId || null : null,
          label: st.assocLabel.trim() || undefined,
          tags: [`${tag}·中断`],
        })
      }
    }
    set({ running: false, seconds: durationSec(get().mode), focusStart: null })
  },

  setAssoc(a, id) {
    set({ assoc: a, assocId: id })
  },

  setAssocLabel(label) {
    set({ assocLabel: label })
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
      const now = new Date()
      // 用实际经过时长而不是当前配置值：专注中途改了设置，记录仍与真实时长一致
      const focusMin = Math.max(1, Math.round((now.getTime() - new Date(st.focusStart).getTime()) / 60000))
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
        label: st.assocLabel.trim() || undefined,
        tags: [tag],
      }
      void usePomodoroStore.getState().add(session)
      /**
       * **一次专注跑完 = 一次完成事件**（Step 5-2C D 批）。
       *
       * 只在这里发：`reset()` 里那条 session 打的是「·中断」标签，
       * 是**放弃**而不是完成 —— 在那里发事件就等于"中途放弃也庆祝"。
       *
       * 权重按产品既有语义给：**绑定了实事的专注 = 一次闭关**（`grantSeclusion` 同一条判据），
       * 因此记为 high（→ 重要完成）；未绑定待办的普通专注记为 mid。
       */
      emitCompletion({
        source: 'pomodoro',
        entityType: 'pomodoroSessions',
        entityId: session.id,
        completedAt: session.endAt,
        weight: session.taskId || session.courseId || session.projectId || session.label ? 'high' : 'mid',
      })
      // 闭关结算：**绑定了一件实事的专注 = 一次闭关**，完成才给功行。
      // 日常行为是"不修就退"，闭关才是主动精进、把境界推上去的主路径
      // （计分见 services/cultivation.ts 的 seclusionReward）。
      // 普通专注（未绑定待办）不给 —— 否则"坐着发呆 25 分钟"也能刷功行。
      // ⚠️ 判据含 `label`（Step 5-3C）：闭关内容改成**自由输入**之后，
      // "练两小时 Python"这类没有对应待办的事也必须算一次闭关 ——
      // 只认 taskId 会让新入口变成一条"填了也不算"的死路。
      if (session.taskId || session.label) {
        void useCultivationStore.getState().grantSeclusion(focusMin)
      }
      const name =
        (session.taskId
          ? useTaskStore.getState().items.find((t) => t.id === session.taskId)?.title
          : session.courseId
            ? useCourseStore.getState().items.find((c) => c.id === session.courseId)?.name
            : session.projectId
              ? useProjectStore.getState().items.find((p) => p.id === session.projectId)?.name
              : undefined) ?? (session.label || undefined)
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
