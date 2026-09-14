/**
 * NotificationGate —— 全局轻量通知（到期待办 / 今日课程 / 关注更新）
 * 非强制弹窗：应用内 toast；可选浏览器 Notification（需授权）
 */
import { useEffect, useRef } from 'react'
import { useTaskStore } from '../../stores/useTaskStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { useFollowStore } from '../../stores/useLifeStores'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useConflictStore } from '../../stores/useConflictStore'
import { dueTaskNotices, followUpdateCount, browserNotify } from '../../services/notification'
import { playSound } from '../../services/sound'
import { useToast } from '../ui/Toast'
import { todayISO } from '../../utils/id'

export function NotificationGate() {
  const toast = useToast().toast
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)
  const browserNotifyOn = useSettingsStore((s) => s.browserNotify)
  const syncStatus = useSettingsStore((s) => s.syncStatus)
  const syncError = useSettingsStore((s) => s.syncError)
  const pendingConflicts = useConflictStore((s) => s.pendingCount)
  const tasks = useTaskStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const follows = useFollowStore((s) => s.items)
  const intel = useIntelligenceStore((s) => s.items)
  const lastDayRef = useRef('')

  useEffect(() => {
    if (!notifyEnabled) return
    const run = () => {
      const now = todayISO()
      // 每日只提醒一次
      if (lastDayRef.current === now) return
      lastDayRef.current = now
      const notices = dueTaskNotices(tasks, now)
      for (const n of notices) {
        toast(`${n.title} · ${n.body}`, n.tone === 'cinnabar' ? 'danger' : 'info')
        if (browserNotifyOn) void browserNotify(n.title, n.body)
      }
      // 今日课程提醒
      const weekday = new Date().getDay()
      const todayClasses = courses
        .flatMap((c) =>
          (c.schedule ?? [])
            .filter((s) => s.weekday === weekday)
            .map((s) => ({ name: c.name, start: s.start })),
        )
        .sort((a, b) => a.start.localeCompare(b.start))
      if (todayClasses.length > 0) {
        // 取当前时间之后的最近一节课；若今日课都已结束则报第一节次日课
        const nowHM = new Date().toTimeString().slice(0, 5)
        const next =
          todayClasses.find((c) => c.start > nowHM) ?? todayClasses[0]
        toast(`今日 ${todayClasses.length} 节课 · 下一节 ${next.name} ${next.start}`, 'info')
        if (browserNotifyOn) void browserNotify('课程提醒', `今日 ${todayClasses.length} 节课，下一节 ${next.name} ${next.start}`)
      }
    }
    // 挂载后稍作延迟，避免与首屏抢注意力
    const t = window.setTimeout(run, 2500)
    return () => window.clearTimeout(t)
  }, [notifyEnabled, browserNotifyOn, tasks, courses, toast])

  // 关注更新：监听情报变化时轻提示（去抖）
  const lastFollowRef = useRef(0)
  useEffect(() => {
    if (!notifyEnabled) return
    const count = followUpdateCount(follows, intel)
    if (count === 0) return
    const now = Date.now()
    if (now - lastFollowRef.current < 60000) return // 60s 去抖
    lastFollowRef.current = now
    toast(`你的关注有 ${count} 条更新`, 'info')
    playSound('notification')
    if (browserNotifyOn) void browserNotify('关注更新', `你的关注对象有 ${count} 条新情报`)
  }, [follows, intel, notifyEnabled, browserNotifyOn, toast])

  // 同步异常 / 冲突待处理：主动提醒（状态变化时只提醒一次，避免 30s 自动重试期间反复弹）
  const lastSyncRef = useRef<{ status: string; error?: string; conflicts: number }>({
    status: 'idle',
    conflicts: 0,
  })
  useEffect(() => {
    if (!notifyEnabled) return
    const prev = lastSyncRef.current
    const cur = { status: syncStatus, error: syncError, conflicts: pendingConflicts }
    lastSyncRef.current = cur

    // 同步失败：从非 error 进入 error 时提醒一次
    if (syncStatus === 'error' && prev.status !== 'error' && syncError) {
      const msg = `同步失败：${syncError}`
      toast(msg, 'danger')
      playSound('notification')
      if (browserNotifyOn) void browserNotify('知白台 · 同步失败', syncError)
      return
    }
    // 冲突：pending 从 0 变为 >0 时提醒一次（人工解决入口在设置页「同步」）
    if (pendingConflicts > 0 && prev.conflicts === 0) {
      const msg = `同步发现 ${pendingConflicts} 条待处理冲突`
      toast(msg, 'info')
      playSound('notification')
      if (browserNotifyOn) void browserNotify('知白台 · 同步冲突', `${pendingConflicts} 条记录需人工选择版本`)
    }
  }, [syncStatus, syncError, pendingConflicts, notifyEnabled, browserNotifyOn, toast])

  return null
}
