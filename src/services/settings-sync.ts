/**
 * 偏好设置同步 —— 让「换了设备还要重设一遍」的那部分设置真正跨设备一致
 *
 * 背景：设置此前整体只落浏览器本地（zustand persist）。同步快照只覆盖业务表，
 * 于是一台设备上配好的自建代理、AI 模型、每日目标、番茄钟时长，
 * 换台设备全要重配 —— 分类不同步也是同一个根因。
 *
 * 做法：把「跨设备希望一致」的键写进业务表 appSettings（单行），
 * 随加密快照走 LWW 合并；主题 / 布局 / 底栏排列等设备级偏好留在本地。
 * 密钥与 Token 一律不在白名单内（它们各有独立的加密存储）。
 */
import { useSettingsStore, type SettingsState } from '../stores/useSettingsStore'
import { appSettingsRepo } from '../repositories/settings-repo'
import { notifyDataChanged } from '../sync/auto'
import type { AppSettingsRow, SyncedSettings } from '../types/entities'

/** 参与同步的设置键（新增键请连同 SyncedSettings 一起补） */
const SYNCED_SETTING_KEYS = [
  'profileName',
  'waterGoalMl',
  'pomodoroFocusMin',
  'pomodoroBreakMin',
  'notifyEnabled',
  'soundEnabled',
  'soundVolume',
  'browserNotify',
  'intelAutoFetch',
  'intelFetchMinutes',
  'intelKeepLimit',
  'corsProxyUrl',
  'aiProvider',
  'aiBaseUrl',
  'aiModel',
  'termStartDate',
] as const satisfies readonly (keyof SettingsState)[]

const ROW_ID = 'settings'
/** 写库去抖：音量滑杆这类连续变更不必每次都落一次盘 */
const WRITE_DEBOUNCE_MS = 800

let hydrating = false
let started = false
let timer: number | null = null

type SyncedKey = (typeof SYNCED_SETTING_KEYS)[number]

function pick(state: SettingsState): SyncedSettings {
  const out: Partial<Record<SyncedKey, unknown>> = {}
  for (const key of SYNCED_SETTING_KEYS) {
    const value = state[key]
    if (value !== undefined) out[key] = value
  }
  return out as SyncedSettings
}

async function writeNow(): Promise<void> {
  try {
    const existing = await appSettingsRepo.get(ROW_ID)
    const now = new Date().toISOString()
    const row: AppSettingsRow = {
      id: ROW_ID,
      data: pick(useSettingsStore.getState()),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await appSettingsRepo.put(row)
    // 设置变化也要触发一次同步：否则改了目标/代理，别的设备要等下一次业务写入才拿到
    notifyDataChanged()
  } catch (e) {
    console.warn('[知白台] 偏好设置写入失败', e)
  }
}

function scheduleWrite(): void {
  if (typeof window === 'undefined') return
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => void writeNow(), WRITE_DEBOUNCE_MS)
}

/** 把库里的设置回灌进 store（启动时与同步/导入后各调用一次） */
export async function hydrateSyncedSettings(): Promise<void> {
  try {
    const row = await appSettingsRepo.get(ROW_ID)
    if (!row?.data) return
    hydrating = true
    try {
      useSettingsStore.setState(row.data as Partial<SettingsState>)
    } finally {
      hydrating = false
    }
  } catch (e) {
    console.warn('[知白台] 偏好设置读取失败', e)
  }
}

/** 订阅 store：白名单键变化即落库。幂等，重复调用无副作用。 */
export function initSyncedSettings(): void {
  if (started) return
  started = true
  useSettingsStore.subscribe((state, prev) => {
    // 回灌自身不应再触发写回，否则与远端来回抖动
    if (hydrating) return
    const changed = SYNCED_SETTING_KEYS.some((key) => state[key] !== prev[key])
    if (changed) scheduleWrite()
  })
}
