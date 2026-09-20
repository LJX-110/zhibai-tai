/**
 * 全局故障记录 —— 事件回调与异步任务里的异常兜底
 *
 * 为什么需要它
 * ------------
 * `ErrorBoundary` 只能捕获**渲染期**异常（React 的边界就是这么设计的）。而实际让用户
 * 说出「点了按钮没反应」的那类故障，几乎全发生在它管不到的地方：
 *
 *   · `onClick` 里抛的错 —— React 不会转发给错误边界，只会冒泡到 window；
 *   · 没被 await / 没接 catch 的 Promise —— 只会触发 `unhandledrejection`；
 *   · 定时器回调、事件监听器里的错 —— 同上。
 *
 * 这三条路径此前**既不降级、也不提示、也不留痕**，用户看到的就是「没反应」，我们手里
 * 也拿不到任何线索。本模块把这三条路径收进一份本机故障流水，并在设置页可查。
 *
 * 为什么落 localStorage 而不进业务表
 * --------------------------------
 * 这与 `services/notification.ts` 的通知历史是同一个判断：这是**本机当下**的故障流水，
 * 不是需要跨设备同步的用户数据。存业务表会把它卷进同步快照与冲突检测，得不偿失。
 *
 * 三条自我约束（都很重要）
 * ----------------------
 * 1. **绝不抛错**：这个模块运行在错误处理器**内部**，它自己抛错会变成新的未捕获错误，
 *    进而再次触发处理器 —— 直接构成死循环。所以每处都包了 try/catch。
 * 2. **去重**：同一个故障在窗口期内只记一次、只提醒一次。否则一个每帧都抛的错会瞬间
 *    刷满 50 条记录、并弹出几十个 toast。
 * 3. **滤噪**：主动放弃一类「已知且无意义」的错误（见 isIgnorableError），
 *    保证流水里剩下的都是真信号。
 */
import { createId, nowISO } from '../utils/id'

/** 故障来源：脚本错误 / 未处理的 Promise 拒绝 / 渲染期异常（由 ErrorBoundary 记入） */
export type ErrorKind = 'error' | 'rejection' | 'render'

export interface ErrorRecord {
  id: string
  at: string
  kind: ErrorKind
  message: string
  /** 出错位置：脚本错误取 `文件:行:列` */
  where?: string
  /** 截断后的堆栈 */
  detail?: string
}

export interface NewErrorInput {
  kind: ErrorKind
  message: string
  where?: string
  detail?: string
}

const LOG_KEY = 'zbt:error-log:v1'
const LOG_MAX = 50
/** 同一故障的去重窗口：窗口内重复出现只记一次 */
const DEDUPE_WINDOW_MS = 5000
/** 单次会话最多打扰用户几次 —— 超过就只记不弹，避免故障刷屏 */
const MAX_TOASTS_PER_SESSION = 5
/** 堆栈截断长度：够看出前几层调用栈，又不至于把 localStorage 撑满 */
const DETAIL_MAX = 600

/* ------------------------------------------------------------------ *
 * 读取
 * ------------------------------------------------------------------ */

export function listErrors(): ErrorRecord[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) return parsed as ErrorRecord[]
  } catch {
    /* 存档损坏按空流水处理 —— 读不通就是没有，不值得再抛一次 */
  }
  return []
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(LOG_KEY)
  } catch {
    /* 清不掉也不影响使用 */
  }
}

/* ------------------------------------------------------------------ *
 * 描述：把任意 thrown 值转成可读文本
 * ------------------------------------------------------------------ */

/**
 * `throw` 出来的不一定是 Error —— 可以是字符串、数字、对象、甚至 undefined。
 * `String(value)` 对普通对象会得到 "[object Object]"，等于什么都没说，
 * 所以对象优先试 JSON。
 */
export function describeThrown(value: unknown): string {
  if (value instanceof Error) return value.message || value.name || '未知错误'
  if (typeof value === 'string') return value
  if (value == null) return String(value)
  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value)
      if (text && text !== '{}') return text
    } catch {
      /* 循环引用等无法序列化的情况，落到下面 */
    }
    return Object.prototype.toString.call(value)
  }
  return String(value)
}

function stackOf(value: unknown): string | undefined {
  if (value instanceof Error && value.stack) return truncate(value.stack)
  return undefined
}

function truncate(text: string): string {
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}…` : text
}

/* ------------------------------------------------------------------ *
 * 滤噪
 * ------------------------------------------------------------------ */

/** 已知的、无信息量的错误特征 */
const IGNORABLE_PATTERNS = [
  // 我们自己 abort 掉的请求（切换页面、用户点「停止生成」）都会走到这里，不是故障
  'AbortError',
  'The user aborted a request',
  // 浏览器已知的良性告警：观测尺寸在帧内变化，重排一次即自愈
  'ResizeObserver loop',
]

export function isIgnorableError(message: string): boolean {
  return IGNORABLE_PATTERNS.some((p) => message.includes(p))
}

/* ------------------------------------------------------------------ *
 * 写入
 * ------------------------------------------------------------------ */

/** 上次记录的特征与时刻（模块级，够用且不引入额外状态） */
let lastKey = ''
let lastAt = 0

const keyOf = (input: NewErrorInput) => `${input.kind}\u0000${input.message}`

/**
 * 记录一条故障。窗口期内重复的同一故障返回 `null`（不写、也不该提醒），
 * 调用方据此决定要不要打扰用户。
 */
export function recordError(input: NewErrorInput): ErrorRecord | null {
  try {
    const key = keyOf(input)
    const now = Date.now()
    if (key === lastKey && now - lastAt < DEDUPE_WINDOW_MS) return null
    lastKey = key
    lastAt = now

    const record: ErrorRecord = {
      id: createId(),
      at: nowISO(),
      kind: input.kind,
      message: input.message,
      where: input.where,
      detail: input.detail ? truncate(input.detail) : undefined,
    }

    const next = [record, ...listErrors()].slice(0, LOG_MAX)
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(next))
    } catch {
      /* 隐私模式 / 配额满：退化为「只在本次会话内不计」，不影响提示与运行 */
    }
    return record
  } catch {
    // 兜底：本模块绝不允许因自身失败而抛出（见文件头的约束 1）
    return null
  }
}

/* ------------------------------------------------------------------ *
 * 安装全局处理器
 * ------------------------------------------------------------------ */

export interface InstallOptions {
  /** 只对「新」故障回调一次；重复故障被去重后不会调用 */
  notify?: (record: ErrorRecord) => void
  /** 便于测试注入替身 */
  target?: Window
}

let installed = false

/**
 * 注册 `window` 的 `error` 与 `unhandledrejection`，返回卸载函数。
 * 重复调用是安全的（幂等）：第二次直接返回空卸载函数，不会重复登记。
 */
export function installGlobalErrorHandlers(options: InstallOptions = {}): () => void {
  const target = options.target ?? (typeof window === 'undefined' ? undefined : window)
  if (!target || installed) return () => {}
  installed = true

  let notified = 0
  const handle = (input: NewErrorInput) => {
    if (isIgnorableError(input.message)) return
    const record = recordError(input)
    if (!record) return
    if (notified >= MAX_TOASTS_PER_SESSION) return
    notified += 1
    try {
      options.notify?.(record)
    } catch {
      /* 提示失败不影响记录本身 */
    }
  }

  const onError = (event: ErrorEvent) => {
    handle({
      kind: 'error',
      // error 为 null 时只剩 message 可用（跨域脚本正是这种：浏览器只给一行
      // "Script error."，拿不到任何细节）。这里必须先判空再转文本 ——
      // 直接 describeThrown(null) 会得到字符串 "null"，那就是一条毫无信息量的记录。
      message: event.error == null ? event.message : describeThrown(event.error),
      where: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
      detail: stackOf(event.error),
    })
  }

  const onRejection = (event: PromiseRejectionEvent) => {
    handle({
      kind: 'rejection',
      message: describeThrown(event.reason),
      detail: stackOf(event.reason),
    })
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)

  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
    installed = false
  }
}

/**
 * 供测试重置模块级状态（安装标记与去重窗口）。
 * 生产代码不该调用它 —— 唯一用途是让单测之间互不污染。
 */
export function __resetErrorLogStateForTest(): void {
  installed = false
  lastKey = ''
  lastAt = 0
}

/** 故障来源的中文说法（设置页显示用） */
export const KIND_LABEL: Record<ErrorKind, string> = {
  error: '脚本错误',
  rejection: '未处理的异步错误',
  render: '渲染异常',
}
