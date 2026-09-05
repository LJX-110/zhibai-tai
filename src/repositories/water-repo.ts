/** 喝水数据访问 */
import { db } from '../db/db'
import type { WaterLog } from '../types/entities'
import { createRepository } from './repo'

export const waterRepo = createRepository<WaterLog>(db.waterLogs)

/** 某日喝水记录 */
export async function listWaterByDate(date: string): Promise<WaterLog[]> {
  return db.waterLogs.where('date').equals(date).toArray()
}

/** 某日喝水总量 ml */
export async function waterTotalByDate(date: string): Promise<number> {
  const logs = await listWaterByDate(date)
  return logs.reduce((s, l) => s + l.amountMl, 0)
}
