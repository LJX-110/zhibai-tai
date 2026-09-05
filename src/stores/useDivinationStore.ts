/** 占卜 store */
import { divinationRepo } from '../repositories/divination-repo'
import { signOf, type DailySign } from '../services/divination'
import { createId } from '../utils/id'
import type { DivinationRecord } from '../types/entities'
import { createCrudStore } from './factory'

export const useDivinationStore =
  createCrudStore<DivinationRecord>(divinationRepo)

/** 构建每日签记录（按日期确定性取签：同一天任何设备结果一致） */
export function buildDailySignRecord(date: string): DivinationRecord {
  const sign = signOf(date)
  return {
    id: createId(),
    type: 'daily_sign',
    date,
    title: `每日签 · ${sign.title}`,
    input: date,
    result: `${sign.tag} · ${sign.title}`,
    interpretation: sign.text,
    tags: ['每日签', sign.tag],
    createdAt: new Date().toISOString(),
  }
}

export interface TodaySignResult {
  sign: DailySign
  /** true = 本次刚入档；false = 今天已记过 */
  saved: boolean
}

/**
 * 记录某日之签（已记则幂等返回已有签文）。
 * 供占卜页与命令面板共用，消除两处重复实现。
 */
export async function saveDailySignRecord(
  date: string,
): Promise<TodaySignResult> {
  const sign = signOf(date)
  const store = useDivinationStore.getState()
  const existing = store.items.find(
    (r) => r.type === 'daily_sign' && r.date === date,
  )
  if (existing) return { sign, saved: false }
  await store.add(buildDailySignRecord(date))
  return { sign, saved: true }
}
