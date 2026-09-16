/** 斩三尸习惯数据访问 */
import { db } from '../db/db'
import type { Habit, HabitLog } from '../types/entities'
import { createRepository } from './repo'

export const habitRepo = createRepository<Habit>(db.habits)
export const habitLogRepo = createRepository<HabitLog>(db.habitLogs)
