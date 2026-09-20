/** 喝水数据访问 */
import { db } from '../db/db'
import type { WaterLog } from '../types/entities'
import { createRepository } from './repo'

export const waterRepo = createRepository<WaterLog>(db.waterLogs)
