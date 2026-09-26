/**
 * NotificationGate —— 事件驱动的即时提示（关注更新 / 同步失败 / 同步冲突）
 *
 * 「到点该提醒的事」（待办 / 固定任务 / 课程 / 作业 / 考试 / 习惯 / 喝水）
 * 已迁往 `ReminderEngine`（判定统一收口在 services/reminders.ts）——
 * 那些是"时间到了就该说"的事，要按周期调度与细粒度去重。
 * 这里留下的三类是"**状态一变就该说**"的事：它们没有周期，靠订阅状态变化触发。
 *
 * 投递一律走 `./deliver` —— 本文件只说"发生了什么"，不说"要不要打扰"
 * （总开关 / 每源开关 / 免打扰 / 记历史都在管线里，与提醒引擎共用同一套）。
 */
import { useEffect, useRef } from 'react'
import { useFollowStore } from '../../stores/useLifeStores'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useConflictStore } from '../../stores/useConflictStore'
import { followUpdateCount, shouldAnnounceFollowUpdate } from '../../services/notification'
import { deliverNotice } from './deliver'

/** 关注更新的去抖：情报一轮抓取会连续写入多条，不该逐条弹 */
const FOLLOW_DEBOUNCE_MS = 60_000

export function NotificationGate() {
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)
  const syncStatus = useSettingsStore((s) => s.syncStatus)
  const syncError = useSettingsStore((s) => s.syncError)
  const pendingConflicts = useConflictStore((s) => s.pendingCount)
  const follows = useFollowStore((s) => s.items)
  const intel = useIntelligenceStore((s) => s.items)

  // 关注更新：**只在"未读匹配数变多"时**轻提示（去抖）
  // ⚠️ 判据不能只看"计数 > 0" —— 未读数是个稳定值，那样每轮抓取（数组引用一变
  // effect 就重跑）都会把同一条再弹一次。原因与判据见
  // `services/notification.ts` 的 `shouldAnnounceFollowUpdate`。
  const lastCountRef = useRef<number | null>(null)
  const lastFollowAtRef = useRef(0)
  useEffect(() => {
    const count = followUpdateCount(follows, intel)
    const prev = lastCountRef.current
    // 基线无条件记录：关掉通知期间的变化不该在重开时"补弹"
    lastCountRef.current = count
    if (!notifyEnabled) return
    if (!shouldAnnounceFollowUpdate(prev, count)) return
    const now = Date.now()
    if (now - lastFollowAtRef.current < FOLLOW_DEBOUNCE_MS) return
    lastFollowAtRef.current = now
    deliverNotice({
      source: 'intel',
      title: '关注更新',
      text: `你的关注有 ${count} 条更新`,
      hash: '#/intelligence',
      system: true,
      sound: true,
    })
  }, [follows, intel, notifyEnabled])

  // 同步异常 / 冲突待处理：主动提醒（状态变化时只提醒一次，避免 30s 自动重试期间反复弹）
  const lastSyncRef = useRef<{ status: string; error?: string; conflicts: number }>({
    status: 'idle',
    conflicts: 0,
  })
  useEffect(() => {
    if (!notifyEnabled) return
    const prev = lastSyncRef.current
    lastSyncRef.current = { status: syncStatus, error: syncError, conflicts: pendingConflicts }

    // 同步失败：从非 error 进入 error 时提醒一次
    if (syncStatus === 'error' && prev.status !== 'error' && syncError) {
      deliverNotice({
        source: 'sync',
        title: '知白台 · 同步失败',
        text: `同步失败：${syncError}`,
        tone: 'danger',
        hash: '#/system',
        system: true,
        sound: true,
      })
      return
    }
    // 冲突：pending 从 0 变为 >0 时提醒一次（人工解决入口在设置页「同步」）
    if (pendingConflicts > 0 && prev.conflicts === 0) {
      deliverNotice({
        source: 'sync',
        title: '知白台 · 同步冲突',
        text: `同步发现 ${pendingConflicts} 条待处理冲突`,
        hash: '#/system',
        system: true,
        sound: true,
      })
    }
  }, [syncStatus, syncError, pendingConflicts, notifyEnabled])

  return null
}
