/**
 * 通知基础设施 —— 权限 / 能力诊断 / 系统通知 / 免打扰 / 提醒历史
 *
 * 「现在该提醒什么」的判定已全部迁往 `services/reminders.ts`（纯函数，八源）；
 * 本文件只提供**投递能力**，不再持有任何提醒规则。
 * （原先的 `dueTaskNotices` / `claimDailyNotice` 是提醒规则的旧实现，
 *   已分别由 `reminders.ts` 的 `taskReminders` 与 `reminder-claims.ts` 取代，故移除。）
 */
import { createId } from '../utils/id'
import type { NoticeSourceKey } from './notify-sources'

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
 * 「关注更新」这次该不该说 —— **只在计数变多时说**。
 *
 * ⚠️ 判据为什么不是「计数 > 0」：`followUpdateCount` 数的是"**未读**里匹配关注的数量"，
 * 只要用户不去点阅，它就是个**稳定的非零值**。若只按"时间到了 + 计数非零"触发，
 * 每轮抓取写入情报（数组引用一变 effect 就重跑）都会**把同一条提示再弹一次** ——
 * 用户看到的就是"重复响"，而这与"状态一变就说"的设计声明并不一致
 * （真正的状态变化是"未读变多了"，不是"又抓了一轮"）。
 *
 * 首次挂载（`prev === null`）也**不提示**，只记基线：刷新页面不是新增，
 * "你有 N 条未读"这件事已由情报页的未读徽标承担。
 */
export function shouldAnnounceFollowUpdate(prev: number | null, count: number): boolean {
  if (count === 0) return false
  if (prev === null) return false
  return count > prev
}

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

/** 当前系统通知权限（`getNotifyCapability` / `requestNotifyPermission` 的内部依赖） */
function notifyPermission(): NotifyPermission {
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
 * 通知历史（**应用内通知**的唯一存储）—— toast 2.6 秒就消失，错过的提醒此前完全无痕。
 * 每次投递顺手记一条；存 localStorage 而不进业务表：
 * 这是本机当下的通知流水，不是需要跨设备同步的数据。
 *
 * ⚠️ `source` 必填于**投递管线**（`components/notification/deliver.ts`），
 * 操作回执（"待办已保存"）走默认的 `'app'` —— 两类混在一起的话
 * 通知中心会退化成操作日志，翻不到真正错过的提醒。
 *
 * ## 与 Toast 的分工（Step 5-3C 定稿）
 * ```
 * 事件发生 → Notification Service ┬─ 持久通知（本文件，可查看/已读/追踪）
 *                                └─ Toast 即时反馈（2.6s 后消失）
 * ```
 * 两者**不是**两套业务逻辑：投递管线（`deliver.ts`）是唯一出口，它既落通知也弹 toast。
 * 不值得留档的即时反馈（"已复制"）只走 toast，不落到这里。
 */
const HISTORY_KEY = 'zbt:notice-history:v1'
const HISTORY_MAX = 50

/** 同类合并窗口：同源 + 同文案在此期间内重复出现 → 合并为一条并累加次数 */
const MERGE_WINDOW_MS = 5 * 60 * 1000
/** 过期清理：超过这个天数的通知由 `pruneNotices` 移除 */
const NOTICE_MAX_AGE_DAYS = 30

/** 列表左侧色点用的严重度（与 ToastTone 同义，但这里持久化，故单独命名避免循环依赖） */
export type NoticeTone = 'info' | 'success' | 'danger'

export interface NoticeRecord {
  id: string
  message: string
  /** 可选标题（提醒类由投递管线给；回执类只有 message） */
  title?: string
  /** 带跳转目标时一并存下，列表里能直达对应板块 */
  hash?: string
  /** 归属（提醒源 / `'app'` 操作回执）；老记录没有这个字段，按 `'app'` 显示 */
  source?: NoticeSourceKey
  at: string
  /** 是否已读。⚠️ 老记录（v1）没有这个字段 —— 迁移时**按已读**处理 */
  read: boolean
  /** 严重度 → 色点；老记录按 `info` */
  tone?: NoticeTone
  /** 同源同文案合并时的累计次数（≥2 时列表显示 ×N） */
  count?: number
}

/**
 * 老记录字段补齐 —— **必须把缺 `read` 的当成已读**：
 * 通知一旦引入"未读"概念，历史里那几十条旧提醒若默认未读，
 * 用户升级后第一次打开就会看到一个爆炸的未读角标，而它们早就过去了。
 */
function normalize(list: NoticeRecord[]): NoticeRecord[] {
  return list.map((n) => ({
    ...n,
    read: typeof n.read === 'boolean' ? n.read : true,
    tone: n.tone ?? 'info',
    count: typeof n.count === 'number' && n.count > 0 ? n.count : 1,
  }))
}

function save(list: NoticeRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)))
  } catch {
    /* 存储满 / 隐私模式写不进去时放弃记账，不影响提醒本身 */
  }
  // `save` 是**唯一写入口**（记录 / 已读 / 删除 / 清理都经它）——
  // 订阅的触发点因此只在这一处：不会漏（新通知不亮角标）也不会重复
  emit()
}

/**
 * 变更订阅（Step 5-3D）：未读角标要跨组件更新，而通知此前只有"读一次"的 API。
 * 订阅者拿到的是"列表变了"这一事实，值本身仍走 `unreadNoticeCountCached`。
 */
const listeners = new Set<() => void>()
/** 未读数缓存：`useSyncExternalStore` 需要 getSnapshot 在未变化时返回同值 */
let unreadCache: number | null = null

function emit(): void {
  unreadCache = null
  for (const fn of listeners) fn()
}

export function subscribeNotices(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 未读数（带缓存）—— 供 `useSyncExternalStore` 与任何非 React 消费者使用 */
export function unreadNoticeCountCached(): number {
  if (unreadCache === null) unreadCache = unreadNoticeCount()
  return unreadCache
}

/** 全部通知，**最新在前** */
export function listNoticeHistory(): NoticeRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) return normalize(parsed as NoticeRecord[])
  } catch {
    /* 存档损坏按空历史处理 */
  }
  return []
}

/** 未读数（纯函数，可传已取到的列表避免重复读盘） */
export function unreadNoticeCount(list: NoticeRecord[] = listNoticeHistory()): number {
  return list.reduce((sum, n) => sum + (n.read ? 0 : 1), 0)
}

export interface RecordNoticeOptions {
  /** 提醒类的标题（回执类不用） */
  title?: string
  /** 严重度 → 色点 */
  tone?: NoticeTone
  /** 跳过去重合并，强制新增一条 */
  noMerge?: boolean
}

/**
 * 记一条通知。
 *
 * **去重合并**（继承 B2 的 Toast 思路）：同一个源 + 同一句文案在 5 分钟内反复出现，
 * 不再堆一条新的，而是把原条**提到最前**、刷新时间、累加次数、重置为未读。
 * 否则"同步失败"连发四次就会把通知中心刷成同一句话的四行。
 */
export function recordNotice(
  message: string,
  hash?: string,
  source: NoticeSourceKey = 'app',
  options: RecordNoticeOptions = {},
): void {
  const list = listNoticeHistory()
  const at = new Date().toISOString()
  if (!options.noMerge) {
    const now = Date.now()
    const idx = list.findIndex(
      (n) =>
        n.message === message &&
        (n.source ?? 'app') === source &&
        now - new Date(n.at).getTime() <= MERGE_WINDOW_MS,
    )
    if (idx >= 0) {
      const hit = list[idx]
      const merged: NoticeRecord = {
        ...hit,
        at,
        read: false,
        count: (hit.count ?? 1) + 1,
        hash: hash ?? hit.hash,
        title: options.title ?? hit.title,
        tone: options.tone ?? hit.tone,
      }
      save([merged, ...list.filter((_, i) => i !== idx)])
      return
    }
  }
  const rec: NoticeRecord = {
    id: createId(),
    message,
    title: options.title,
    hash,
    source,
    at,
    read: false,
    tone: options.tone ?? 'info',
    count: 1,
  }
  save([rec, ...list])
}

/** 单条标记已读 */
export function markNoticeRead(id: string): void {
  const list = listNoticeHistory()
  if (!list.some((n) => n.id === id && !n.read)) return
  save(list.map((n) => (n.id === id ? { ...n, read: true } : n)))
}

/** 全部标记已读 */
export function markAllNoticesRead(): void {
  const list = listNoticeHistory()
  if (!list.some((n) => !n.read)) return
  save(list.map((n) => ({ ...n, read: true })))
}

/** 删掉单条（回执类常见：看过了就不必留） */
export function dismissNotice(id: string): void {
  save(listNoticeHistory().filter((n) => n.id !== id))
}

/**
 * 清理过期通知（默认 30 天）。返回清掉的条数。
 * 容量上限（50 条）是"防爆"，这里是"按时间退役" —— 两者互补。
 */
export function pruneNotices(now = Date.now(), maxAgeDays = NOTICE_MAX_AGE_DAYS): number {
  const list = listNoticeHistory()
  const cutoff = now - maxAgeDays * 864e5
  const kept = list.filter((n) => {
    const t = new Date(n.at).getTime()
    return Number.isFinite(t) ? t >= cutoff : false
  })
  const removed = list.length - kept.length
  if (removed > 0) save(kept)
  return removed
}

export function clearNoticeHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* 同上：清不掉也不影响使用 */
  }
  emit()
}
