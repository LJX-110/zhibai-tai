/**
 * 提醒引擎 —— 统一调度（吸收原 NotificationGate 的开局扫描与 ClassReminder 的逐节提醒）
 *
 * 「现在该提醒什么」的全部判定在 `services/reminders.ts` 的纯函数里（可单测）；
 * 这里只做三件事：**读快照 → 套投递策略 → 认领去重键**。
 *
 * 投递策略**不在这里** —— 统一收口在 `./deliver`（总开关 / 每源开关 / 免打扰 / 记历史 /
 * 提示音 / 系统通知上限），这里只负责**判定 → 聚合成组 → 交给管线**。
 * 从前这套策略散在本文件、`NotificationGate` 与业务页各一份，三份各漏一块。
 *
 * 节奏：挂载 2.5s 后先跑一次（避免与首屏抢注意力），之后每分钟一次；
 * 长时间挂后台会被浏览器节流，回前台补一次，否则跨过提醒窗口的事就永久漏掉了。
 */
import { useEffect } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useTaskStore } from '../../stores/useTaskStore'
import {
  useCourseCancellationStore,
  useCourseRescheduleStore,
  useCourseStore,
  useExamStore,
  useHomeworkStore,
} from '../../stores/useStudyStore'
import { useHabitLogStore, useHabitStore } from '../../stores/useHabitStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { claimReminder } from '../../services/reminder-claims'
import { sourceOfReminderKind } from '../../services/notify-sources'
import { deliverNotice } from './deliver'
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
  /* 只订阅"要不要跑"这一个开关。浏览器通知开关、每源开关、免打扰时段
     都**不在依赖里** —— 它们由投递管线在投递那一刻现读（`getState()`），
     放进来只会让每分钟的调度在改设置时被重建，换不来任何正确性。 */
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)

  useEffect(() => {
    // 总开关关掉整条调度就不跑（省掉每分钟的空转）；管线里还有一层兜底
    if (!notifyEnabled) return

    const tick = () => {
      const now = new Date()
      const st = useSettingsStore.getState()
      const reminders = collectReminders(
        {
          tasks: useTaskStore.getState().items,
          courses: useCourseStore.getState().items,
          // 停课记录：漏传的话「已停的课仍会提醒」—— 用户报过的那个问题就在这一处
          courseCancellations: useCourseCancellationStore.getState().items,
          // 调课记录：同上，且**必须也传**——调走的那次在原时间不再提醒、新时间才提醒，
          // 漏传就退化成"按原时间照响"（与停课漏传是同一个坑，别再踩一次）
          courseReschedules: useCourseRescheduleStore.getState().items,
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

      let systemSent = 0
      /* 提示音整轮只响一次 —— 开局可能同时有多组到期，每组各响一声会叠成噪音。
         什么时候响、要不要被静音、夜里挡不挡，都交给管线裁决（那里知道设置）。 */
      let soundPending = true
      for (const [kind, items] of groups) {
        // 认领：本组里还有没被认领过的项才发（按项记，当天新增的事项当次就会重发整组）
        if (!items.some((r) => claimReminder(r.key, r.period))) continue
        const label = REMINDER_KIND_LABEL[kind]
        const critical = items.some((r) => r.critical)
        const canSystem = critical && systemSent < MAX_SYSTEM_PER_TICK
        if (canSystem) systemSent += 1
        const outcome = deliverNotice({
          source: sourceOfReminderKind(kind),
          title: label,
          text: `${label} · ${items.map((r) => r.title).join('、')}`,
          tone: items.some((r) => r.tone === 'danger') ? 'danger' : 'info',
          hash: items[0].hash,
          system: canSystem,
          sound: soundPending,
        })
        // 只有真的打扰了才消耗掉"这一轮的声音额度"：被静音/免打扰时不占额度，
        // 免得第一组恰好被静音、后面该响的组反而静了
        if (outcome === 'delivered') soundPending = false
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
  }, [notifyEnabled])

  return null
}
