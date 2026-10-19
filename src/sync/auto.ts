/**
 * 自动同步 —— 数据变更 → 去抖 → 自动同步
 * 支持：开/关、间隔（立即/30s/5m/手动）、网络恢复自动同步、失败重试（限次）
 */
import { useSettingsStore } from '../stores/useSettingsStore'
import type { SyncInterval } from '../stores/useSettingsStore'
import { isDirty, markDirty } from './dirty'
import { runSync } from './SyncService'

/**
 * 「本地有改动待同步」标记在 `sync/dirty.ts`（持久化 + 可订阅 + 版本号）。
 * 这里 re-export 保持既有引用路径不变；清标记由 SyncService 在推送成功后统一做。
 *
 * ⚠️ 2026-10-02：标记**持久化到 localStorage**（离线队列的最小实现）——
 * 此前是纯内存变量，离线期间的改动刷新页面后归零，
 * 网络恢复也不会补推，用户只看到"改了没同步 / 同步老是失败"。
 * ⚠️ 2026-10-19：清标记收口到 `SyncService` —— 手动同步此前不清，标记会一直挂着。
 */
export { isDirty, subscribeDirty } from './dirty'

let timer: number | null = null
let inFlight = false
let failCount = 0
const MAX_RETRY = 3

function delayFor(interval: SyncInterval): number | null {
  switch (interval) {
    case 'immediate':
      return 500
    case '30s':
      return 30_000
    case '5m':
      return 300_000
    case 'manual':
      return null
  }
}

/** 同步目标是否配齐（纯函数，便于 selector / 组件复用，避免判定逻辑两处漂移）。
 *  同步仅支持「仓库完整」模式（云笺 gist 已下线） */
export function isConfigured(s: {
  syncPassword?: string
  githubRepo?: string
  githubToken?: string
}): boolean {
  if (!(s.syncPassword ?? '').trim()) return false
  return Boolean((s.githubRepo ?? '').trim()) && Boolean((s.githubToken ?? '').trim())
}

/** 老用户本地残留 gist 配置时，启动强制迁回仓库模式（仅剩 repo 一种同步方式，数据在仓库快照里） */
function migrateSyncModeToRepo(): void {
  const s = useSettingsStore.getState()
  // 老版本持久化的 syncMode 可能是 'gist'（类型已收敛为 'repo'），故在此做一次类型收窄
  if ((s.syncMode as string | undefined) === 'gist') {
    s.set({ syncMode: 'repo' })
  }
}

/** 同步目标是否已配置完整 —— 未配置时自动同步静默跳过，
 *  避免默认开启自动同步后每次数据变更都弹「请设置 Sync Password」 */
export function isSyncConfigured(): boolean {
  return isConfigured(useSettingsStore.getState())
}

function schedule() {
  const s = useSettingsStore.getState()
  if (!s.autoSync || s.syncInterval === 'manual') return
  const delay = delayFor(s.syncInterval)
  if (delay == null) return
  // 非浏览器环境（vitest 等）没有 window：自动同步只在浏览器里跑
  if (typeof window === 'undefined') return
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => void doSync(), delay)
}

async function doSync() {
  if (inFlight) return
  const s = useSettingsStore.getState()
  if (!s.autoSync || !isDirty()) return
  // dirty 保留：等用户配好同步参数后，下一次变更会把积压的改动一并推上去
  if (!isSyncConfigured()) return
  inFlight = true
  try {
    await runSync()
    failCount = 0
    // 成功且同步窗口内没有新写入时，dirty 已由 SyncService 清掉。
    // 仍为 true 只有两种可能：同步期间又改了数据（不在本次快照里），
    // 或本次因并发锁被跳过 —— 都要再排一次，不能把标记丢掉。
    if (isDirty()) schedule()
  } catch {
    failCount++
    // 失败重试（限次），否则保留 dirty 待下次
    if (failCount <= MAX_RETRY) {
      timer = window.setTimeout(() => void doSync(), 30_000)
    }
  } finally {
    inFlight = false
  }
}

/** 数据变更时调用（store 工厂统一埋点） */
export function notifyDataChanged(): void {
  markDirty()
  const s = useSettingsStore.getState()
  if (!s.autoSync || s.syncInterval === 'manual') return
  schedule()
}

/** 网络恢复 / 回前台自动同步 —— 两者都只在"有积压改动"时才排一次 */
export function initAutoSync(): void {
  if (typeof window === 'undefined') return
  // 云笺已下线：老配置（gist）一次性迁移为仓库模式
  migrateSyncModeToRepo()
  // 启动补一次：上次会话留下的「待同步」改动已持久化，不必等下一次数据变更才推
  if (isDirty() && navigator.onLine !== false) schedule()
  window.addEventListener('online', () => {
    const s = useSettingsStore.getState()
    if (s.autoSync && isDirty()) schedule()
  })
  // 回前台补一次：移动端 PWA 常被系统冻结，恢复时可能已跨过好几个节拍
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const s = useSettingsStore.getState()
    if (s.autoSync && isDirty() && navigator.onLine !== false) schedule()
  })
}
