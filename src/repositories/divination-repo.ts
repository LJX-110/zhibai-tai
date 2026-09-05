/** 占卜记录数据访问 */
import { db } from '../db/db'
import type { DivinationRecord } from '../types/entities'
import { createRepository } from './repo'

export const divinationRepo =
  createRepository<DivinationRecord>(db.divinationRecords)
