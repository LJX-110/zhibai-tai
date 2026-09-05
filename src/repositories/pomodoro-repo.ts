/** 番茄钟 Session 数据访问 */
import { db } from '../db/db'
import type { PomodoroSession } from '../types/entities'
import { createRepository } from './repo'

export const pomodoroRepo = createRepository<PomodoroSession>(db.pomodoroSessions)

/** 某日（本地）Session，按开始时间倒序 */
export async function listSessionsByDate(fromISO: string, toISO: string) {
  const from = new Date(`${fromISO}T00:00:00`).getTime()
  const to = new Date(`${toISO}T23:59:59`).getTime()
  return db.pomodoroSessions
    .where('startAt')
    .between(from, to)
    .reverse()
    .toArray()
}
