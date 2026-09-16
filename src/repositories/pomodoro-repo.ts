/** 番茄钟 Session 数据访问 */
import { db } from '../db/db'
import type { PomodoroSession } from '../types/entities'
import { createRepository } from './repo'

export const pomodoroRepo = createRepository<PomodoroSession>(db.pomodoroSessions)
