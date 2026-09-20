/**
 * 轻量通知 —— 到期待办 / 关注更新 / 情报更新（非强制弹窗）
 * 应用内 toast + 可选浏览器 Notification
 */
import type { Task } from '../types/entities'
import { createId } from '../utils/id'

export interface Notice {
  id: string
  title: string
  body: string
  tone?: 'cinnabar' | 'bronze' | 'teal'
}

/** 计算到期/逾期待办通知（纯函数） */
export function dueTaskNotices(tasks: Task[], today: string): Notice[] {
  const due = tasks.filter((t) => !t.done && t.dueDate === today)
  const overdue = tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today)
  const out: Notice[] = []
  if (overdue.length > 0) {
    out.push({
      id: 'due-overdue',
      title: `${overdue.length} 项待办已逾期`,
      body: overdue.slice(0, 3).map((t) => t.title).join(' · '),
      tone: 'cinnabar',
    })
  }
  if (due.length > 0) {
    out.push({
      id: 'due-today',
      title: `${due.length} 项待办今日到期`,
      body: due.slice(0, 3).map((t) => t.title).join(' · '),
      tone: 'bronze',
    })
  }
  return out
}

/** 关注更新计数（纯函数） */
export function followUpdateCount(
  follows: { keyword: string }[],
  items: { title: string; tags: string[]; category?: string; source?: string; read: boolean }[],
): number {
  const unread = items.filter((it) => !it.read)
  if (follows.length === 0 || unread.length === 0) return 0
  return follows.filter((f) =>
    unread.some(
      (it) =>
        it.title.toLowerCase().includes(f.keyword.toLowerCase()) ||
        (it.tags ?? []).some((t) => t.toLowerCase().includes(f.keyword.toLowerCase())) ||
        (it.category ?? '').toLowerCase().includes(f.keyword.toLowerCase()) ||
        (it.source ?? '').toLowerCase().includes(f.keyword.toLowerCase()),
    ),
  ).length
}

/**
 * 每日提醒去重记录。
 *
 * 此前用组件内 ref / 模块级 Set 记「今天提醒过」：应用一刷新就清空，
 * 于是每次冷启动都会把当天的待办与课程提醒重播一遍（用户反馈的
 * 「晚上打开还在报今早第一节课」有一半来自这里）。改为落 localStorage，
 * 且只保留「今天」的记录，跨日自动作废。
 */
const DAILY_KEY = 'zbt:notice-daily:v1'

function readDailyLog(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch {
    /* 存档损坏按「无记录」处理，最坏结果是多提醒一次 */
  }
  return {}
}

/** 认领一次每日提醒：今天未提醒过则记录并返回 true，已提醒过返回 false */
export function claimDailyNotice(key: string, today: string): boolean {
  const log = readDailyLog()
  if (log[key] === today) return false
  log[key] = today
  // 只留今天的记录，避免这张表随使用天数无限增长
  for (const k of Object.keys(log)) {
    if (log[k] !== today) delete log[k]
  }
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(log))
  } catch {
    /* 隐私模式写不进去：退化为仅本次会话内去重，不影响功能 */
  }
  return true
}

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

/** 当前系统通知权限（设置页据此给出可操作的提示，而不是让开关假装成功） */
export function notifyPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as NotifyPermission
}

/** 是否以独立窗口运行（iOS 只有「添加到主屏幕」之后才有 Notification） */
function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

/** Service Worker 就绪等待的兜底时长 */
const SW_READY_TIMEOUT_MS = 3000

/**
 * 等 Service Worker 就绪，**带超时**。
 *
 * `navigator.serviceWorker.ready` 在 SW 未注册或注册失败时是一个永不 settle 的
 * Promise（它只 resolve、从不 reject）。直接 await 会让发通知的调用永久挂起 ——
 * 既发不出去、也不报错，用户看到的就是"通知功能坏了但毫无线索"。
 */
async function serviceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
    ])
  } catch {
    return null
  }
}

/** 通知能力诊断 —— 设置页据此指出"卡在哪一步" */
export interface NotifyCapability {
  /** 浏览器是否支持 Notification API */
  supported: boolean
  permission: NotifyPermission
  /** 是否以独立窗口运行（iOS 未安装时必然发不出） */
  standalone: boolean
  /** Service Worker 是否就绪（缺它则移动端系统通知发不出） */
  swReady: boolean
}

export async function getNotifyCapability(): Promise<NotifyCapability> {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const reg = supported ? await serviceWorkerReady() : null
  return {
    supported,
    permission: notifyPermission(),
    standalone: isStandaloneDisplay(),
    swReady: reg !== null,
  }
}

/**
 * 请求系统通知授权。
 * 必须在用户手势（点击）中调用 —— 定时器回调里调用会被浏览器直接忽略，
 * 因此只能由设置页的开关触发，不能由提醒逻辑自行触发。
 */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  const current = notifyPermission()
  if (current !== 'default') return current
  try {
    return (await Notification.requestPermission()) as NotifyPermission
  } catch {
    return 'denied'
  }
}

/**
 * 发系统通知。
 *
 * 必须优先走 Service Worker：Android Chrome 禁止页面侧 `new Notification()`，
 * 会抛 "Illegal constructor"，旧实现把它吞进 catch，导致移动端系统通知永远是静默失效。
 * `hash` 用于点击通知后跳到应用内对应板块（由 public/sw-notify.js 的
 * notificationclick 处理）。
 */
export async function browserNotify(
  title: string,
  body: string,
  hash = '#/',
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  const options: NotificationOptions = {
    body,
    // 同名通知互相替换，避免同一件事堆成多条
    tag: title,
    silent: true,
    data: { hash },
  }
  const reg = await serviceWorkerReady()
  if (reg) {
    try {
      await reg.showNotification(title, options)
      return true
    } catch {
      /* SW 在、但 showNotification 失败（权限被撤销 / 配额）时，继续走页面构造 */
    }
  }
  try {
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}

/** 设置页「发送测试通知」用：走与真实提醒完全相同的链路，通不通一试便知 */
export async function sendTestNotification(): Promise<boolean> {
  return browserNotify('知白台 · 测试通知', '看到这条就说明系统通知链路是通的', '#/system')
}

/**
 * 免打扰判定 —— **纯函数**，起止由调用方传入（不让 services 反向依赖 store）。
 * 支持跨零点：'23:00' → '07:00' 表示覆盖整夜。
 */
export function isQuietNow(from: string, to: string, now = new Date()): boolean {
  const toMinutes = (v: string) => {
    const [h, m] = v.split(':')
    return (Number(h) || 0) * 60 + (Number(m) || 0)
  }
  const start = toMinutes(from)
  const end = toMinutes(to)
  const cur = now.getHours() * 60 + now.getMinutes()
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end
}

/**
 * 通知历史 —— toast 2.6 秒就消失，错过的提醒此前完全无痕。
 * 每次弹 toast 时顺手记一条；存 localStorage 而不进业务表：
 * 这是本机当下的提醒流水，不是需要跨设备同步的数据。
 */
const HISTORY_KEY = 'zbt:notice-history:v1'
const HISTORY_MAX = 50

export interface NoticeRecord {
  id: string
  message: string
  /** 带跳转目标时一并存下，历史里能直达对应板块 */
  hash?: string
  at: string
}

export function listNoticeHistory(): NoticeRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) return parsed as NoticeRecord[]
  } catch {
    /* 存档损坏按空历史处理 */
  }
  return []
}

export function recordNotice(message: string, hash?: string): void {
  try {
    const next: NoticeRecord[] = [
      { id: createId(), message, hash, at: new Date().toISOString() },
      ...listNoticeHistory(),
    ].slice(0, HISTORY_MAX)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* 存储满 / 隐私模式写不进去时放弃记账，不影响提醒本身 */
  }
}

export function clearNoticeHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* 同上：清不掉也不影响使用 */
  }
}
