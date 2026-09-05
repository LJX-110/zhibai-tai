/** 情报数据访问 */
import { db } from '../db/db'
import type { IntelligenceItem } from '../types/entities'
import { createRepository } from './repo'

export const intelligenceRepo =
  createRepository<IntelligenceItem>(db.intelligenceItems)
