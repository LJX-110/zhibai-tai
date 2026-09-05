/** 情报源 数据访问 */
import { db } from '../db/db'
import type { IntelligenceSource } from '../types/entities'
import { createRepository } from './repo'

export const sourceRepo = createRepository<IntelligenceSource>(db.intelligenceSources)
