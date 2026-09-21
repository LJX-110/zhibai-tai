/**
 * 提醒引擎 —— 统一调度（吸收原 NotificationGate 的开局扫描与 ClassReminder 的逐节提醒）
 *
 * 「现在该提醒什么」的全部判定在 `services/reminders.ts` 的纯函数里（可单测）；
 * 这里只做三件事：**读快照 → 套投递策略 → 认领去重键**。
 *
 * 投递策略
 *  · 免打扰时段：只记入历史，不弹 toast、不发系统通知（夜里不该被吵醒）；
 *  · 系统通知只发给 `critical` 项，且单轮有上限 —— 开局可能积压一整天的事项，全发就是 flood；
 *  · 同组聚合成一条提示（标题列表），但认领按项：**当天新增的事项它的键还没被认领，
 *    当次就会整组重发** —— 这是旧版单一 `'tasks'` 键做不到的。
 *
 * 节奏：挂载 2.5s 后先跑一次（避免与首屏抢注意力），之后每分钟一次；
 * 长时间挂后台会被浏览器节流，回前台补一次，否则跨过提醒窗口的事就永久漏掉了。
 */
import { useEffect } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useCourseStore, useExamStore, useHomeworkStore } from '../../stores/useStudyStore'
import { useHabitLogStore, useHabitStore } from '../../stores/useHabitStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { useToastStore } from '../ui/Toast'
import { browserNotify, isQuietNow, recordNotice } from '../../services/notification'
import { claimReminder } from '../../services/reminder-claims'
import {
  REMINDER_KIND_LABEL,
  collectReminders,
  type DueReminder,
} from '../../services/reminders'

/** 单轮最多发几条系统通知 */
const MAX_SYSTEM_PER_TICK = 3
/** 首次延迟：与首屏抢注意力的事让给首屏 */
const FIRST_RUN_DELAY_MS = 2500
/** 调度周期：上课提醒需要分钟级，再长就会跨过 15 分钟窗口 */
const TICK_MS = 60_000

export function ReminderEngine() {
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)
  const browserNotifyOn = useSettingsStore((s) => s.browserNotify)

  useEffect(() => {
    if (!notifyEnabled) return

    const tick = () => {
      const now = new Date()
      const st = useSettingsStore.getState()
      const reminders = collectReminders(
        {
          tasks: useTaskStore.getState().items,
          courses: useCourseStore.getState().items,
          homeworks: useHomeworkStore.getState().items,
          exams: useExamStore.getState().items,
          habits: useHabitStore.getState().items,
          habitLogs: useHabitLogStore.getState().items,
          waterLogs: useWaterStore.getState().items,
          waterGoalMl: st.waterGoalMl,
          termStartDate: st.termStartDate,
        },
        now,
      )

      // 同组聚合成一条提示；组内出现任一未认领项就整组重发（认领也按项记）
      const groups = new Map<DueReminder['kind'], DueReminder[]>()
      for (const r of reminders) {
        const list = groups.get(r.kind)
        if (list) list.push(r)
        else groups.set(r.kind, [r])
      }

      const quiet = st.quietEnabled && isQuietNow(st.quietFrom, st.quietTo, now)
      let systemSent = 0
      for (const [kind, items] of groups) {
        if (!items.some((r) => claimReminder(r.key, r.period))) continue
        const label = REMINDER_KIND_LABEL[kind]
        const text = `${label} · ${items.map((r) => r.title).join('、')}`
        const hash = items[0].hash
        if (quiet) {
          recordNotice(text, hash)
          continue
        }
        useToastStore
          .getState()
          .push(text, items.some((r) => r.tone === 'danger') ? 'danger' : 'info', hash)
        if (browserNotifyOn && systemSent < MAX_SYSTEM_PER_TICK && items.some((r) => r.critical)) {
          systemSent += 1
          void browserNotify(label, items.map((r) => r.title).join('、'), hash)
        }
      }
    }

    const first = window.setTimeout(tick, FIRST_RUN_DELAY_MS)
    const timer = window.setInterval(tick, TICK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [notifyEnabled, browserNotifyOn])

  return null
}
