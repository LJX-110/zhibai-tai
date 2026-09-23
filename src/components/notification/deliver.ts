/**
 * 通知投递管线 —— **所有"提醒"的唯一出口**
 *
 * ## 为什么要有这一层（此前是四处各写一遍）
 * 提醒的**判定**早已统一（`services/reminders.ts` 纯函数八源 + `reminder-claims` 去重），
 * 但**投递**还是散着的：提醒引擎一套、事件门一套、业务页（财务取件）又一套。
 * 于是三条策略全都只覆盖了一部分：
 *
 * | 策略 | 漏在哪 |
 * | --- | --- |
 * | 总开关 `notifyEnabled` | 业务页直接 `browserNotify` 的那条**不受它管** |
 * | 免打扰时段 | 同上 —— 夜里下单照样弹系统通知 |
 * | 记入历史 | 只记"弹过的"；被抑制/被关掉的**无痕**，事后翻不到 |
 *
 * 现在收敛成一处：**判定通过 → 一定记历史；是否打扰 → 由策略决定**。
 * 顺序刻意如此 —— "没打扰我"和"没发生过"是两件事，历史必须都能回看。
 *
 * ## 四条策略（按顺序短路）
 * 1. **总开关**关掉 → 记历史，不打扰；
 * 2. **该源被单独关掉** → 记历史，不打扰；
 * 3. **免打扰时段** → 记历史，不打扰；
 * 4. 通过 → 弹 toast（必然）+ 提示音（可选）+ 系统通知（可选，还要浏览器开关与权限）。
 *
 * ## 边界：这里只管"提醒"，不管"操作回执"
 * `useToastStore.push` 那一百多处调用（"待办已保存"）**不经过本管线** ——
 * 它们是操作反馈，不该受"通知开关"约束（关掉通知不等于点了按钮没反应）。
 * 它们照旧记进历史，但标记为 `'app'`，不冒充提醒。
 *
 * ## 为什么用 `getState()` 而不是 hook
 * 调用方里有定时器回调（提醒引擎每分钟）、订阅回调（事件门）、按钮处理（取件提醒）——
 * 都不是渲染期，拿不到 hook。所以本模块是**命令式出口**，只在调用瞬间读一次设置。
 */
import { browserNotify, isQuietNow, recordNotice } from '../../services/notification'
import { isNotifySourceOn, type NotifySource } from '../../services/notify-sources'
import { playSound } from '../../services/sound'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useToastStore } from '../ui/toast-store'

export interface NoticeInput {
  /** 归属源（决定每源开关；见 `services/notify-sources.ts`） */
  source: NotifySource
  /** 系统通知的标题（应用内 toast 不显示它 —— toast 只有一行正文） */
  title: string
  /** 正文：toast 与系统通知共用 */
  text: string
  tone?: 'info' | 'success' | 'danger'
  /** 点击后的跳转目标 */
  hash?: string
  /** 是否允许发系统通知（仍受浏览器开关 / 权限 / 免打扰约束） */
  system?: boolean
  /**
   * 是否播放提示音。一轮聚合出多条时**只给第一条传 true** ——
   * 开局可能同时有多组到期，每组各响一声会叠成噪音。
   */
  sound?: boolean
}

/** 投递结果（调用方一般不关心，测试与诊断用） */
export type DeliveryOutcome =
  /** 正常打扰了：toast + 音 +（可选）系统通知 */
  | 'delivered'
  /** 免打扰时段：只记历史 */
  | 'quiet'
  /** 被总开关或每源开关静音：只记历史 */
  | 'muted'

/**
 * 投递一条提醒。
 *
 * ⚠️ **记历史在最前**：被静音 / 免打扰的提醒也要留下痕迹，
 * 否则用户第二天只会看到"昨天什么都没提醒"，而真相是"被设置挡掉了"。
 * 两条分支各记一次、**不重复记**：正常打扰时由 `push` 顺带记（它拿得到 source），
 * 被挡下时这里显式记 —— 一条提醒在历史里只会出现一次。
 */
export function deliverNotice(input: NoticeInput): DeliveryOutcome {
  const st = useSettingsStore.getState()
  const muted = !st.notifyEnabled || !isNotifySourceOn(st.notifySources, input.source)
  const quiet = !muted && st.quietEnabled && isQuietNow(st.quietFrom, st.quietTo)

  if (muted) {
    recordNotice(input.text, input.hash, input.source)
    return 'muted'
  }
  if (quiet) {
    recordNotice(input.text, input.hash, input.source)
    return 'quiet'
  }

  // 传 source → 顺带记进历史（见 toast-store 的 push 注释）
  useToastStore.getState().push(input.text, input.tone ?? 'info', input.hash, input.source)
  if (input.sound) playSound('notification')
  if (input.system && st.browserNotify) {
    void browserNotify(input.title, input.text, input.hash ?? '#/')
  }
  return 'delivered'
}
