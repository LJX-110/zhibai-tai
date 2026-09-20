/**
 * 同步模块 —— 类型定义
 * 同步以全量加密快照在设备间流转（实现已完整）。
 */
import type { SyncFile } from './SyncService'

/** 同步 Provider 抽象（GitHub 私有仓库等均可实现） */
export interface SyncProvider {
  id: string
  name: string
  readSyncFile(): Promise<SyncFile | null>
  writeSyncFile(f: SyncFile): Promise<void>
}
