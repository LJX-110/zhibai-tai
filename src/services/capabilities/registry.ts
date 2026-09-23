/**
 * 系统能力注册表 —— 宿主只认识这个接口，不认识任何具体能力
 *
 * ## 状态存哪里（与最初设想的一处偏离，说明理由）
 * 原计划把授权状态存 localStorage 并同步。实现时发现**没必要也不应该**：
 *  · **权限的真相在浏览器**（`navigator.permissions`），存一份本地副本只会与之不一致；
 *  · 取到的**值**（坐标/剪贴板）有 **5 分钟时效**，落盘没有意义，反而多一份敏感数据；
 *  ⇒ 全部**只放内存**。这也自动满足了"授权是设备级"的要求 —— 内存天然不跨设备。
 *
 * ## 快照必须稳定引用
 * `getSnapshots()` 供 `useSyncExternalStore` 使用，**未变化时必须返回同一个数组引用**，
 * 否则每次读取都会触发重渲染（React 会认为 store 一直在变）。
 */
import { clipboardCapability } from './clipboard'
import { geoCapability } from './geo'
import { VALUE_TTL_MS, type Capability, type CapabilityKind, type CapabilitySnapshot } from './types'

const ALL: Capability[] = [geoCapability, clipboardCapability]

/** 内存态：kind → { state, value, at } */
const cache = new Map<CapabilityKind, { state: CapabilitySnapshot['state']; value: string | null; at: number | null }>()
const listeners = new Set<() => void>()

/** 快照数组的稳定引用（未变化时复用） */
let snapshot: CapabilitySnapshot[] = []

function rebuild(): void {
  snapshot = ALL.filter((c) => c.supported()).map((c) => {
    const hit = cache.get(c.kind)
    return {
      kind: c.kind,
      label: c.label,
      state: hit?.state ?? 'idle',
      value: hit?.value ?? null,
      at: hit?.at ?? null,
    }
  })
  for (const fn of listeners) fn()
}

/** 当前快照（同步读；供 useSyncExternalStore） */
export function getSnapshots(): CapabilitySnapshot[] {
  return snapshot
}

export function subscribeCapabilities(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function capabilityOf(kind: CapabilityKind): Capability | undefined {
  return ALL.find((c) => c.kind === kind)
}

/** 值是否还在有效期内（过期的值不再进上下文 —— 给模型十分钟前的坐标比不给更糟） */
export function isFresh(s: CapabilitySnapshot, now = Date.now()): boolean {
  return s.value !== null && s.at !== null && now - s.at < VALUE_TTL_MS
}

/**
 * 查询各能力的权限状态（**只查询，不触发授权**）。
 * 失败一律按 idle 处理 —— 查询不到权限不代表没授权，把它当成"未知、可点"最合理。
 */
export async function refreshCapabilityStates(): Promise<void> {
  for (const c of ALL) {
    if (!c.supported()) continue
    const next = await c.state()
    const prev = cache.get(c.kind)
    if (!prev || prev.state !== next) {
      cache.set(c.kind, { state: next, value: prev?.value ?? null, at: prev?.at ?? null })
    }
  }
  // 无论如何都 publish 一次：首次调用时 cache 为空，界面需要拿到"支持哪些能力"
  rebuild()
}

/**
 * 由**用户手势**触发取值。
 * 成功 → 写入快照并返回该值；失败/拒绝 → 状态置 denied 并返回 null（**不抛**）。
 */
export async function requestCapability(kind: CapabilityKind): Promise<string | null> {
  const c = capabilityOf(kind)
  if (!c) return null
  const value = await c.request()
  const prev = cache.get(kind)
  cache.set(kind, {
    state: value !== null ? 'granted' : (prev?.state === 'granted' ? 'granted' : 'denied'),
    value,
    at: value !== null ? Date.now() : (prev?.at ?? null),
  })
  rebuild()
  return value
}
