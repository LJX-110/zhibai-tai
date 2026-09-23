/**
 * 桌宠搭话的**节流** —— 防骚扰（比"说什么"更要紧）
 *
 * 为什么单独一个文件：`sayings.ts` 必须是纯函数（好测），而节流天然要**记状态**。
 * 分开之后，"说什么"和"多久说一次"各自可调，也各自可测。
 *
 * ## 三条约束（都对应一种会被骂的表现）
 *  · **同档去抖 30 分钟** —— 同一件事的同一档位，半小时内只说一次
 *    （功行每涨 1 点就冒泡 = 骚扰）；
 *  · **每日上限 12 条** —— 正常使用约 1–3 条/天，上限只是兜底；
 *  · **可手动静音** —— 菜单里「安静一小时」，只压气泡、**不改全局通知开关**。
 *
 * ## 状态放哪
 * 说话记录是**本机当下**的事（不是要跨设备同步的数据），
 * 所以与"通知历史"同一条约定：不进业务表。
 *  · 已说记录：内存（刷新即重置，正好符合"当天"的语义）；
 *  · 静音截止：localStorage（菜单点了就该记住，刷新不该失效）。
 */
const DEBOUNCE_MS = 30 * 60 * 1000
const DAILY_MAX = 12
const HUSH_KEY = 'zbt:pet-hush-until:v1'

/** key → 上次说出的时刻 */
const saidAt = new Map<string, number>()

/** 当日已说条数的日期戳 + 计数 */
let countDay = ''
let count = 0

/** 静音截止时刻（0 = 没静音） */
let hushUntil = 0

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 读取持久化的静音截止（模块首次使用时同步一次即可） */
function loadHush(): void {
  try {
    const raw = localStorage.getItem(HUSH_KEY)
    const v = raw ? Number(raw) : 0
    hushUntil = Number.isFinite(v) ? v : 0
  } catch {
    hushUntil = 0
  }
}

/** 是否处于静音（含读取一次持久化值）—— **只在本模块用**，故不外传 */
function isHushed(now: Date): boolean {
  loadHush()
  return Date.parse(now.toString()) < hushUntil || Date.now() < hushUntil
}

/** 静音到某个时刻 */
export function hushFor(ms: number): void {
  hushUntil = Date.now() + Math.max(0, ms)
  try {
    localStorage.setItem(HUSH_KEY, String(hushUntil))
  } catch {
    /* 隐私模式写不进去也无所谓：内存里的截止照样生效 */
  }
}

/** 解除静音 */
export function clearHush(): void {
  hushUntil = 0
  try {
    localStorage.removeItem(HUSH_KEY)
  } catch {
    /* 同上 */
  }
}

/**
 * 这一条现在能不能说。
 * 顺序：**静音 → 跨天重置 → 每日上限 → 同档去抖**。
 */
export function canSay(key: string, now: Date): boolean {
  if (isHushed(now)) return false

  const today = dayKey(now)
  if (countDay !== today) {
    countDay = today
    count = 0
  }
  if (count >= DAILY_MAX) return false

  const last = saidAt.get(key)
  if (last !== undefined && now.getTime() - last < DEBOUNCE_MS) return false
  return true
}

/** 记下"说过了" */
export function markSaid(key: string, now: Date): void {
  const today = dayKey(now)
  if (countDay !== today) {
    countDay = today
    count = 0
  }
  saidAt.set(key, now.getTime())
  count += 1
}

/** 当日已说条数（测试与诊断用） */
export function saidToday(now: Date): number {
  return countDay === dayKey(now) ? count : 0
}

/** 清空全部节流状态（**仅供测试**） */
export function __resetForTest(): void {
  saidAt.clear()
  countDay = ''
  count = 0
  hushUntil = 0
  try {
    localStorage.removeItem(HUSH_KEY)
  } catch {
    /* 同上 */
  }
}
