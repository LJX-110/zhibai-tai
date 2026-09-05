/** 斩三尸习惯 store */
import { habitLogRepo, habitRepo } from '../repositories/habit-repo'
import type { Habit, HabitLog } from '../types/entities'
import { createCrudStore } from './factory'

export const useHabitStore = createCrudStore<Habit>(habitRepo)
export const useHabitLogStore = createCrudStore<HabitLog>(habitLogRepo)
