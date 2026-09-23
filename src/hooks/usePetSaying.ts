/**
 * 桌宠「说什么」的调度（P4）
 *
 * ## 与动画循环的分工
 * `usePetLoop` 管的是**动画**（秒级、状态机驱动）；这里管的是**搭话**（分钟级、状态变化驱动）。
 * 分开的原因与拖拽物理那次一样：两套时间源，谁也别管谁。
 *
 * ## 什么时候检查
 *  · 挂载 3 秒后一次（不与首屏抢注意力）；
 *  · 之后每 60 秒一次；
 *  · 互动后立刻一次（`refresh`）—— 点了它、拖完它，它会接一句；
 *  · 回前台一次（后台期间可能已经跨过该说的时机）。
 *
 * ## 节流在这里统一裁决
 * 能不能说由 `saying-throttle` 判（静音 / 每日上限 / 同档 30 分钟去抖），
 * 说什么由 `sayings.pickSaying` 判 —— **判定与裁决分开**，各自可调可测。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { pickSaying, type Saying, type SayingContext } from '../services/pet/sayings'
import { canSay, markSaid } from '../services/pet/saying-throttle'
import { useCultivation } from './useCultivation'
import { useTaskStore } from '../stores/useTaskStore'
import { usePomodoroStore } from '../stores/usePomodoroStore'
import { useCourseStore, useCourseCancellationStore, useCourseRescheduleStore } from '../stores/useStudyStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { currentWeek, upcomingClasses } from '../services/study'
import { effectiveDone, liveFixedTasks, diffDays } from '../utils/id'

/** 检查周期：搭话是分钟级的事，用不着秒级 */
const CHECK_MS = 60_000
/** 首次检查的延迟（与首屏抢注意力的事让给首屏） */
const FIRST_DELAY_MS = 3000
/** 气泡停留时长 */
const BUBBLE_MS = 3600
/** 「刚结束的闭关」认定窗口：超过这个时间就不算"刚"了 */
const SECLUSION_WINDOW_MS = 2 * 60 * 1000
/** 上次露面的日期（用于算久别天数），**本机当下的事**，不进业务表 */
const LAST_SEEN_KEY = 'zbt:pet-last-seen:v1'

function readLastSeen(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY)
    if (!raw) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function writeLastSeen(now: Date): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, now.toISOString())
  } catch {
    /* 隐私模式写不进去：久别档位就当 0 天，不影响其它功能 */
  }
}

/** 连续未打开天数（同一天回来算 0） */
function awayDays(now: Date): number {
  const last = readLastSeen()
  if (!last) return 0
  const days = Math.floor((now.getTime() - last.getTime()) / 86_400_000)
  return days > 0 ? days : 0
}

export interface UsePetSaying {
  /** 当前要显示的气泡（null = 没有） */
  bubble: Saying | null
  /** 立刻检查一次（互动后调用） */
  refresh: () => void
  /** 手动关掉当前气泡 */
  dismiss: () => void
}

export function usePetSaying(): UsePetSaying {
  const [bubble, setBubble] = useState<Saying | null>(null)
  const timerRef = useRef<number | null>(null)
  const checkRef = useRef<() => void>(() => {})
  const prevRealmRef = useRef<string>('')
  const announcedSeclusionRef = useRef<string>('')
  /** 本次会话是否已计过"每日首次互动" —— 交给菜单/点击那侧去 grant，这里只负责不重复 */
  const seenTodayRef = useRef(false)

  // 数据源：全部订阅（改了就重算），但**不进检查定时器的依赖** —— 定时器只按固定节奏跑
  const cultivation = useCultivation()
  const tasks = useTaskStore((s) => s.items)
  const pomos = usePomodoroStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const cancellations = useCourseCancellationStore((s) => s.items)
  const reschedules = useCourseRescheduleStore((s) => s.items)
  const termStartDate = useSettingsStore((s) => s.termStartDate)
  const petEnabled = useSettingsStore((s) => s.petEnabled)

  /** 组装"现在的状态" —— 纯读，不产生副作用 */
  const buildContext = useCallback((): SayingContext => {
    const now = new Date()
    const realmTitle = cultivation.realm.title
    const realmJustUp = prevRealmRef.current !== '' && prevRealmRef.current !== realmTitle
    prevRealmRef.current = realmTitle

    // 刚结束的闭关：最近一段专注，且 2 分钟内结束、尚未播报过
    let justSeclusionMin: number | null = null
    const focus = [...pomos].filter((p) => p.type === 'focus' && p.endAt).pop()
    if (focus?.endAt) {
      const endedAt = Date.parse(focus.endAt)
      if (
        Number.isFinite(endedAt) &&
        now.getTime() - endedAt < SECLUSION_WINDOW_MS &&
        announcedSeclusionRef.current !== focus.id
      ) {
        announcedSeclusionRef.current = focus.id
        justSeclusionMin = focus.durationMin
      }
    }

    const live = liveFixedTasks(tasks)
    const fixedUndone = live.filter((t) => !effectiveDone(t)).length
    const overdue = live.filter((t) => !effectiveDone(t) && t.dueDate && diffDays(t.dueDate) < 0).length

    // 下一节课：与提醒引擎共用 `upcomingClasses`（同一套判定，不会两套口径）
    const week = currentWeek(termStartDate, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const soon = upcomingClasses(courses, now.getDay(), week, nowMinutes, 15, {
      date: today,
      cancellations,
      reschedules,
    })
    const first = soon[0]
    const nextClass = first
      ? { name: first.course.name, minutesLeft: first.minutesLeft, room: first.course.room }
      : null

    return {
      now,
      todayMerit: cultivation.today.total,
      realmTitle,
      realmJustUp,
      justSeclusionMin,
      fixedUndone,
      overdue,
      nextClass,
      awayDays: awayDays(now),
    }
  }, [cultivation, tasks, pomos, courses, cancellations, reschedules, termStartDate])

  /** 检查一次：判"说什么" → 裁决"能不能说" → 显示 */
  const check = useCallback(() => {
    if (!petEnabled) return
    const now = new Date()
    const saying = pickSaying(buildContext())
    writeLastSeen(now)
    if (!saying) return
    if (!canSay(saying.key, now)) return
    markSaid(saying.key, now)
    setBubble(saying)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setBubble(null), BUBBLE_MS)
  }, [buildContext, petEnabled])

  useEffect(() => {
    // 与动画循环同一条纪律：**最新的一次检查放进 ref**。
    // 若直接把 `check` 写进下面的依赖，任何一次数据变化（待办/功行/课程）
    // 都会重建定时器 —— 首帧延迟与 60 秒周期被反复重置，
    // 数据一忙就永远等不到"该说话"的那一刻。
    checkRef.current = check
  }, [check])

  useEffect(() => {
    if (!petEnabled) return
    // 首帧先记一次"见过"，避免刚装上就因为 lastSeen 为空而判成久别
    const first = window.setTimeout(() => checkRef.current(), FIRST_DELAY_MS)
    const timer = window.setInterval(() => checkRef.current(), CHECK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [petEnabled])

  const dismiss = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    setBubble(null)
  }, [])

  /** 每日首次互动只记一次（真正的加分在菜单/点击那侧调 `grantAffinity`） */
  const refresh = useCallback(() => {
    if (!seenTodayRef.current) {
      seenTodayRef.current = true
    }
    check()
  }, [check])

  return { bubble, refresh, dismiss }
}
