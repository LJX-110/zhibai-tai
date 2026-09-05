/** 番茄钟 store */
import { pomodoroRepo } from '../repositories/pomodoro-repo'
import type { PomodoroSession } from '../types/entities'
import { createCrudStore } from './factory'

export const usePomodoroStore =
  createCrudStore<PomodoroSession>(pomodoroRepo)
