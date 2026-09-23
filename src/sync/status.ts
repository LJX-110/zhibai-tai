/**
 * 同步状态判定 —— **纯函数**，UI 只负责把结果画出来
 *
 * 判据以「**是否已是最新**」为核心，而不是"上次尝试的结果"。
 * 这两者不一样：上次同步成功、但之后又改了数据 → 现在并不是最新的，
 * 若只显示「已同步」，用户会以为数据已经上去了（实际还差一次推送）。
 *
 * 优先级（先到先得）：
 *   未配置 → 未连接 ／ 正在同步 → 同步中 ／ 上次失败 → 同步失败
 *   → 有本地改动 → 有改动待同步 ／ 否则 → 已是最新
 *
 * 「同步失败」排在「有改动」之前：失败更需要用户处理，而失败时必然也是脏的，
 * 若先报"有改动"就把真正的问题（连不上/权限不对）藏起来了。
 */
import type { SyncStatus } from '../stores/useSettingsStore'

export type SyncTone = 'idle' | 'syncing' | 'ok' | 'pending' | 'error'

export interface SyncSummary {
  tone: SyncTone
  /** 一行主文案 */
  label: string
  /** 补充说明（可空） */
  detail?: string
}

export function syncSummary(input: {
  /** 仓库 / 令牌 / 同步密码是否配齐 */
  connected: boolean
  /** 上次同步的结果状态 */
  status: SyncStatus
  /** 是否有本地改动尚未推送 */
  dirty: boolean
  /** 上次失败原因（已译成人话） */
  error?: string
}): SyncSummary {
  if (!input.connected) {
    return { tone: 'idle', label: '未连接', detail: '填好仓库与令牌后再同步' }
  }
  if (input.status === 'syncing') {
    return { tone: 'syncing', label: '同步中' }
  }
  if (input.status === 'error') {
    return { tone: 'error', label: '同步失败', detail: input.error }
  }
  if (input.dirty) {
    return { tone: 'pending', label: '有改动待同步', detail: '本地已改动，尚未推送到远端' }
  }
  return {
    tone: 'ok',
    label: '已是最新',
    detail: input.status === 'success' ? undefined : '尚无本地改动',
  }
}

/** 状态点 / 文字取色（与既有 token 对齐，闭集避免各处写散） */
export const SYNC_TONE_CLASS: Record<SyncTone, { dot: string; text: string }> = {
  idle: { dot: 'bg-ink-faint', text: 'text-ink-faint' },
  syncing: { dot: 'bg-bronze animate-pulse', text: 'text-bronze' },
  ok: { dot: 'bg-teal', text: 'text-teal' },
  pending: { dot: 'bg-bronze', text: 'text-bronze' },
  error: { dot: 'bg-cinnabar', text: 'text-cinnabar' },
}
