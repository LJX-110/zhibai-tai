/**
 * AI 远程状态 —— 让「降级」看得见
 *
 * 起因
 * ----
 * 此前远程调用失败一律被静默兜住（`remoteOr` 里的 `.catch(() => local())`、
 * `tianji-ask` 里 catch 后直接落到本地模板）。表现是：Key 过期 / 额度用尽 /
 * BaseUrl 写错 / 网络不通 / 模型名不存在 —— 用户全都只会看到「天机忽然变笨了、
 * 开始复读模板」，界面上**没有任何一处**告诉他远程其实没在工作。
 * 这类故障最伤人的地方正在于此：它不报错，只让人慢慢不再信任这个功能。
 *
 * 做法
 * ----
 * 把「配置了没有」升级为「**当下到底能不能用**」三态：
 *   unconfigured 未配置远程（本地规则是预期行为，不是故障）
 *   ready        远程可用（最近一次远程调用成功）
 *   degraded     远程配置了但**调用失败**，当前结果是本地兜底 —— 需要显性提示
 * `degraded` 会**保持**到下一次远程调用成功为止，这样偶发的失败不会被下一次
 * 本地兜底覆盖掉。
 *
 * 用 subscribe/getSnapshot 暴露（配 `useSyncExternalStore`），不引入新依赖：
 * provider 是被 services 层切换的模块级单例，状态也就该跟它放在同一层。
 */
import { nowISO } from '../../utils/id'

export type AiRemoteState = 'unconfigured' | 'ready' | 'degraded'

export interface AiRemoteHealth {
  state: AiRemoteState
  /** 最近一次远程失败的原因（degraded 时才有）—— 直接显示给用户看，如 "HTTP 401" */
  reason?: string
  /** 最近一次失败时刻 */
  at?: string
}

let health: AiRemoteHealth = { state: 'unconfigured' }
const listeners = new Set<() => void>()

/** 只在状态真的变化时才换引用并通知 —— 否则每次调用都触发一轮渲染 */
function commit(next: AiRemoteHealth): void {
  if (next.state === health.state && next.reason === health.reason) return
  health = next
  for (const fn of listeners) fn()
}

export function getAiRemoteHealth(): AiRemoteHealth {
  return health
}

export function subscribeAiRemoteHealth(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 未配置远程 Key：本地规则是预期行为，不当作故障 */
export function markAiUnconfigured(): void {
  commit({ state: 'unconfigured' })
}

/** 远程调用成功：清掉之前的失败原因 */
export function markAiRemoteReady(): void {
  commit({ state: 'ready' })
}

/** 远程调用失败：记下原因，保持到下一次成功为止 */
export function markAiRemoteDegraded(reason: string): void {
  commit({ state: 'degraded', reason, at: nowISO() })
}

/** 供测试重置模块级状态（只重置状态，不清订阅者 —— 清掉会让已挂载的订阅静默失效） */
export function __resetAiRemoteHealthForTest(): void {
  health = { state: 'unconfigured' }
}

/** 把任意 thrown 值转成一句人话（与 error-log 的同名工具同源思路，避免互相依赖） */
export function reasonOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err) ?? String(err)
  } catch {
    return String(err)
  }
}
