/**
 * NotificationGate —— 事件驱动的即时提示（关注更新 / 同步失败 / 同步冲突）
 *
 * 「到点该提醒的事」（待办 / 固定任务 / 课程 / 作业 / 考试 / 习惯 / 喝水）
 * 已迁往 `ReminderEngine`（判定统一收口在 services/reminders.ts）——
 * 那些是"时间到了就该说"的事，要按周期调度与细粒度去重。
 * 这里留下的三类是"**状态一变就该说**"的事：它们没有周期，靠订阅状态变化触发。
 */
import { useEffect, useRef } from 'react'
import { useFollowStore } from '../../stores/useLifeStores'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useConflictStore } from '../../stores/useConflictStore'
import { browserNotify, followUpdateCount, isQuietNow, recordNotice } from '../../services/notification'
import { playSound } from '../../services/sound'
import { useToast } from '../ui/Toast'

export function NotificationGate() {
  const toast = useToast().toast
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)
  const browserNotifyOn = useSettingsStore((s) => s.browserNotify)
  const syncStatus = useSettingsStore((s) => s.syncStatus)
  const syncError = useSettingsStore((s) => s.syncError)
  const pendingConflicts = useConflictStore((s) => s.pendingCount)
  const follows = useFollowStore((s) => s.items)
  const intel = useIntelligenceStore((s) => s.items)

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

    const st = useSettingsStore.getState()
    // 免打扰时段：异常提醒同样只记入历史 —— 夜里不该被同步失败吵醒
    const quiet = st.quietEnabled && isQuietNow(st.quietFrom, st.quietTo)

    // 同步失败：从非 error 进入 error 时提醒一次
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
