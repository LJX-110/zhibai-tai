/**
 * 自动同步 —— 数据变更 → 去抖 → 自动同步
 * 支持：开/关、间隔（立即/30s/5m/手动）、网络恢复自动同步、失败重试（限次）
 */
import { useSettingsStore } from '../stores/useSettingsStore'
import type { SyncInterval } from '../stores/useSettingsStore'
import { runSync } from './SyncService'

let dirty = false
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

/** 云笺 gist 已下线：老用户本地残留 gist 配置时，启动强制迁回仓库模式（数据在仓库快照里） */
export function migrateSyncModeToRepo(): void {
  const s = useSettingsStore.getState()
  if ((s.syncMode ?? 'repo') === 'gist') {
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
  if (!s.autoSync || !dirty) return
  // dirty 保留：等用户配好同步参数后，下一次变更会把积压的改动一并推上去
  if (!isSyncConfigured()) return
  inFlight = true
  try {
    await runSync()
    dirty = false
    failCount = 0
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
  dirty = true
  const s = useSettingsStore.getState()
  if (!s.autoSync || s.syncInterval === 'manual') return
  schedule()
}

/** 网络恢复自动同步 */
export function initAutoSync(): void {
  if (typeof window === 'undefined') return
  // 云笺已下线：老配置（gist）一次性迁移为仓库模式
  migrateSyncModeToRepo()
  window.addEventListener('online', () => {
    const s = useSettingsStore.getState()
    if (s.autoSync && dirty) schedule()
  })
}
