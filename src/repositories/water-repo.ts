/** 喝水数据访问 */
import { db } from '../db/db'
import type { WaterLog } from '../types/entities'
import { createRepository } from './repo'

export const waterRepo = createRepository<WaterLog>(db.waterLogs)

/** 某日喝水记录 */
export async function listWaterByDate(date: string): Promise<WaterLog[]> {
  return db.waterLogs.where('date').equals(date).toArray()
}
