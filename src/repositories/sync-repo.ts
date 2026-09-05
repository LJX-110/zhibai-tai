/** 同步队列 / 元数据 数据访问（持久化） */
import { db } from '../db/db'
import type { SyncMeta, SyncQueueRecord } from '../types/entities'
import { createRepository } from './repo'

export const syncQueueRepo =
  createRepository<SyncQueueRecord>(db.syncQueue)
export const syncMetaRepo = createRepository<SyncMeta>(db.syncMeta)

/** 待同步数量 */
export async function pendingSyncCount(): Promise<number> {
  return db.syncQueue.count()
}
