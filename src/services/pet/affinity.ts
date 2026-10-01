/**
 * 好感度（affinity）规则 —— **纯函数**
 *
 * ## 两条原则先定死（改规则时不能破）
 * 1. **只升不降** —— 与境界同一条纪律。它是"你陪了它多久"的记录，
 *    不是奖惩；降值会让人不敢点它（怕扣分），那与桌宠的本意相反。
 * 2. **不设门槛、不解锁功能** —— 好感度高不会"开放"任何东西。
 *    一旦好感度变成门槛，它就成了压力源，而不是陪伴的痕迹。
 *
 * ## 为什么加成都带上限
 * 连点 50 下不该比认真用一天更高 —— 上限让"刷"没有意义，
 * 也让这个数字长期看是"陪了多久"而不是"点得多快"。
 */
/** 好感度事件（调用方只需报事件，规则集中在这里） */
export type AffinityEvent =
  /** 每日首次互动（点击或拖拽都算） */
  | 'first-interact'
  /** 当天点击 */
  | 'click'
  /** 完成一次闭关 */
  | 'seclusion'
  /** 完成一项固定任务 */
  | 'fixed-done'
  /**
   * 完成一件**重要**的事（高优先级待办 / 交作业 / 收工）。
   * 2026-09-30 按用户拍板接入完成反馈：由 `services/completion.ts` 的
   * `onCompletion` 在 `level === 'important'` 时触发。
   */
  | 'task-done'

export interface AffinityRule {
  event: AffinityEvent
  gain: number
  /** 每日上限（Infinity = 不限） */
  dailyCap: number
  desc: string
}

const AFFINITY_RULES: readonly AffinityRule[] = [
  { event: 'first-interact', gain: 1, dailyCap: 1, desc: '每日首次互动' },
  { event: 'click', gain: 1, dailyCap: 3, desc: '当天点击' },
  { event: 'seclusion', gain: 2, dailyCap: Infinity, desc: '完成一次闭关' },
  { event: 'fixed-done', gain: 1, dailyCap: 2, desc: '完成一项固定任务' },
  // 上限 3：一天做成三件重要的事已经很多；不设上限就等于「连点完成刷好感」
  { event: 'task-done', gain: 1, dailyCap: 3, desc: '完成一件重要的事' },
]

/**
 * 一次事件加多少（**纯计算**，不判"今天已加多少" —— 那是调用方的账）。
 * `usedToday` 为该事件今天已用的额度。
 */
export function affinityGain(event: AffinityEvent, usedToday = 0): number {
  const rule = AFFINITY_RULES.find((r) => r.event === event)
  if (!rule) return 0
  if (usedToday >= rule.dailyCap) return 0
  return rule.gain
}

/**
 * 好感**等级门槛**（累积值）—— 纯展示用，**不参与任何判定**。
 *
 * 为什么是这几个数：好感按上面的规则表增长（每日上限合计约 7），
 * 于是 5 是"用了一周"、15 是"半个月"、30 是"一个月"量级 ——
 * 门槛跟着真实累积速度走，不另搞一套"经验/金币"经济系统。
 */
export const AFFINITY_TIERS = [0, 5, 15, 30, 50, 80] as const

export interface AffinityTier {
  /** 等级从 1 开始 */
  level: number
  /** 本级内已累积 */
  current: number
  /** 本级跨度；已满级为 null */
  span: number | null
  /** 本级进度 0~1；已满级为 1 */
  progress: number
}

/** 把累积好感折算成「等级 / 本级进度」——纯函数，可确定化单测 */
export function affinityTier(total: number): AffinityTier {
  const v = Number.isFinite(total) && total > 0 ? total : 0
  let idx = 0
  for (let i = 0; i < AFFINITY_TIERS.length; i++) {
    if (v >= AFFINITY_TIERS[i]) idx = i
  }
  const start = AFFINITY_TIERS[idx]
  const nextStart = AFFINITY_TIERS[idx + 1]
  if (nextStart == null) return { level: idx + 1, current: v - start, span: null, progress: 1 }
  const span = nextStart - start
  const current = v - start
  return { level: idx + 1, current, span, progress: span > 0 ? current / span : 1 }
}

/** 里程碑：连续使用满一定天数的一次性加成（**只加一次**） */
const AFFINITY_MILESTONES: readonly { days: number; gain: number }[] = [
  { days: 7, gain: 5 },
  { days: 30, gain: 20 },
]

/**
 * 已达成的里程碑里，还没发过的总加成。
 * `done` 是**已发过**的天数列表（存在 PetState 里，避免换设备后重发）。
 */
export function milestoneGain(days: number, done: readonly number[] = []): number {
  return AFFINITY_MILESTONES.filter((m) => days >= m.days && !done.includes(m.days)).reduce(
    (s, m) => s + m.gain,
    0,
  )
}

/** 本次达成后要把哪些天数记为已发 */
export function milestoneDaysReached(days: number): number[] {
  return AFFINITY_MILESTONES.filter((m) => days >= m.days).map((m) => m.days)
}

/** 相识天数（满 24 小时算一天，不足算 0 天 → 显示"今天刚认识"） */
export function daysTogether(sinceISO: string, now: Date): number {
  const since = Date.parse(sinceISO)
  if (!Number.isFinite(since)) return 0
  return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000))
}
