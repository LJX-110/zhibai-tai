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
import {
  browserNotify,
  claimDailyNotice,
  dueTaskNotices,
  followUpdateCount,
  isQuietNow,
  recordNotice,
} from '../../services/notification'
import { playSound } from '../../services/sound'
import { activeSlotsOfDay, currentWeek } from '../../services/study'
import { useToast } from '../ui/Toast'
import { nowHM, todayISO, todayWeekday } from '../../utils/id'

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
  useEffect(() => {
    if (!notifyEnabled) return
    const run = () => {
      const today = todayISO()
      // 免打扰时段：提醒**只记入历史**，不弹提示、不发系统通知（夜里不该被吵）
      const st = useSettingsStore.getState()
      const quiet = st.quietEnabled && isQuietNow(st.quietFrom, st.quietTo)
      if (claimDailyNotice('tasks', today)) {
        const notices = dueTaskNotices(tasks, today)
        for (const n of notices) {
          const text = `${n.title} · ${n.body}`
          if (quiet) {
            recordNotice(text, '#/action')
            continue
          }
          toast(text, n.tone === 'cinnabar' ? 'danger' : 'info', '#/action')
          if (browserNotifyOn) void browserNotify(n.title, n.body, '#/action')
        }
      }
      // 课程：只报「还没开始」的最近一节。今天全上完就不报 ——
      // 旧实现用 `?? todayClasses[0]` 兜底，把今天第一节当成「下一节」再报一次，
      // 晚上打开应用就会看到早上 8 点的课（用户反馈的错报来源）
      const weekday = todayWeekday()
      const now = nowHM()
      // 必须经 activeSlotsOfDay 过滤周次：此前只按 weekday 取课，把 weeks（单双周）
      // 完全忽略了 —— 这周本来不上的课照样被算进「今日 N 节课」并触发提醒，
      // 正是用户反馈的「这周不上却仍提醒」。
      const week = currentWeek(useSettingsStore.getState().termStartDate)
      const dayClasses = activeSlotsOfDay(courses, weekday, week)
        .map(({ course, slot }) => ({ name: course.name, start: slot.start }))
        .sort((a, b) => a.start.localeCompare(b.start))
      const next = dayClasses.find((c) => c.start > now)
      if (next && claimDailyNotice('classes', today)) {
        const msg = `今日 ${dayClasses.length} 节课 · 下一节 ${next.name} ${next.start}`
        if (quiet) {
          recordNotice(msg, '#/study')
        } else {
          toast(msg, 'info', '#/study')
          if (browserNotifyOn) void browserNotify('课程提醒', msg, '#/study')
        }
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
    const msg = `你的关注有 ${count} 条更新`
    // 免打扰时段：只记入历史
    const st = useSettingsStore.getState()
    if (st.quietEnabled && isQuietNow(st.quietFrom, st.quietTo)) {
      recordNotice(msg, '#/intelligence')
      return
    }
    toast(msg, 'info', '#/intelligence')
    playSound('notification')
    if (browserNotifyOn) void browserNotify('关注更新', `你的关注对象有 ${count} 条新情报`, '#/intelligence')
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
    const st = useSettingsStore.getState()
    // 免打扰时段：异常提醒同样只记入历史 —— 夜里不该被同步失败吵醒
    const quiet = st.quietEnabled && isQuietNow(st.quietFrom, st.quietTo)

    if (syncStatus === 'error' && prev.status !== 'error' && syncError) {
      const msg = `同步失败：${syncError}`
      if (quiet) {
        recordNotice(msg, '#/system')
        return
      }
      toast(msg, 'danger', '#/system')
      playSound('notification')
      if (browserNotifyOn) void browserNotify('知白台 · 同步失败', syncError, '#/system')
      return
    }
    // 冲突：pending 从 0 变为 >0 时提醒一次（人工解决入口在设置页「同步」）
    if (pendingConflicts > 0 && prev.conflicts === 0) {
      const msg = `同步发现 ${pendingConflicts} 条待处理冲突`
      if (quiet) {
        recordNotice(msg, '#/system')
        return
      }
      toast(msg, 'info', '#/system')
      playSound('notification')
      if (browserNotifyOn) void browserNotify('知白台 · 同步冲突', `${pendingConflicts} 条记录需人工选择版本`, '#/system')
    }
  }, [syncStatus, syncError, pendingConflicts, notifyEnabled, browserNotifyOn, toast])

  return null
}
