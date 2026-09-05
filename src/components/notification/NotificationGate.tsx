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
import { dueTaskNotices, followUpdateCount, browserNotify } from '../../services/notification'
import { playSound } from '../../services/sound'
import { useToast } from '../ui/Toast'
import { todayISO } from '../../utils/id'

export function NotificationGate() {
  const toast = useToast().toast
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)
  const browserNotifyOn = useSettingsStore((s) => s.browserNotify)
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
        const next = todayClasses[0]
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

  return null
}
