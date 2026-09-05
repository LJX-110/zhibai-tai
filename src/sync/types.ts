/**
 * 同步模块 —— Phase 1 接口定义
 * 未来实现：浏览器 → IndexedDB → 加密 → GitHub Private Repository
 */
import type { ID } from '../types/entities'

export type SyncOp = 'create' | 'update' | 'delete'

/** 同步记录：表示某实体的一次变更 */
export interface SyncRecord {
  id: ID
  entity: string
  op: SyncOp
  /** 本地变更时间戳 */
  ts: number
  payload?: unknown
}

export type SyncState = 'idle' | 'syncing' | 'success' | 'error'

export interface SyncResult {
  ok: boolean
  pushed: number
  pulled: number
  message?: string
}

/** 同步 Provider 抽象（GitHub / 未来其他后端均可实现） */
export interface SyncProvider {
  id: string
  name: string
  /** 推送本地变更到远端 */
  push(records: SyncRecord[]): Promise<SyncResult>
  /** 从远端拉取变更 */
  pull(since: number): Promise<{ records: SyncRecord[]; since: number }>
  /** 连通性检查 */
  ping(): Promise<boolean>
}
