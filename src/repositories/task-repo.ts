/** 待办数据访问 */
import { db } from '../db/db'
import type { Task } from '../types/entities'
import { createRepository } from './repo'

export const taskRepo = createRepository<Task>(db.tasks)

/** 按日期区间查询 */
export async function listTasksByDate(from: string, to: string): Promise<Task[]> {
  return db.tasks
    .where('dueDate')
    .between(from, to, true, true)
    .toArray()
}
