/** 斩三尸习惯数据访问 */
import { db } from '../db/db'
import type { Habit, HabitLog } from '../types/entities'
import { createRepository } from './repo'

export const habitRepo = createRepository<Habit>(db.habits)
export const habitLogRepo = createRepository<HabitLog>(db.habitLogs)

/** 某习惯某日记录 */
export async function getHabitLog(habitId: string, date: string) {
  return db.habitLogs.where({ habitId, date }).first()
}

/** 某习惯最近 N 天记录 */
export async function listHabitLogs(habitId: string, from: string, to: string) {
  return db.habitLogs
    .where('habitId')
    .equals(habitId)
    .filter((l) => l.date >= from && l.date <= to)
    .toArray()
}
