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
  /* ⚠️ **故意不订阅总开关、也不因它而停跑**（依赖数组为空）。
   * 理由是不变式一："被静音 ≠ 没发生过" —— 总开关关掉期间到期的提醒，
   * 仍要**进历史**（由投递管线判为 `muted` 后 `recordNotice`），
   * 否则用户第二天翻历史看到的是空白，只会以为提醒坏了。
   * 此前这里是 `if (!notifyEnabled) return`，整轮调度直接不跑 ——
   * 管线里那个 `muted` 记历史的分支**永远执行不到**，与文档里的不变式自相矛盾。
   * 空转成本可忽略：每分钟一次纯函数计算，且同一项同期间只记一次（靠 claim 去重）。 */
  useEffect(() => {
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
  }, [])

  return null
}
