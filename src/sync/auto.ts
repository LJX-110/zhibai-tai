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

function schedule() {
  const s = useSettingsStore.getState()
  if (!s.autoSync || s.syncInterval === 'manual') return
  const delay = delayFor(s.syncInterval)
  if (delay == null) return
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => void doSync(), delay)
}

async function doSync() {
  if (inFlight) return
  const s = useSettingsStore.getState()
  if (!s.autoSync || !dirty) return
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

/** 手动立即同步（Command/按钮） */
export function requestManualSync(): void {
  dirty = true
  void doSync()
}

/** 网络恢复自动同步 */
export function initAutoSync(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => {
    const s = useSettingsStore.getState()
    if (s.autoSync && dirty) schedule()
  })
}

export function isSyncDirty(): boolean {
  return dirty
}
