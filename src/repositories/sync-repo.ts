/** 同步元数据 数据访问（持久化） */
import { db } from '../db/db'
import type { SyncMeta } from '../types/entities'
import { createRepository } from './repo'

export const syncMetaRepo = createRepository<SyncMeta>(db.syncMeta)
