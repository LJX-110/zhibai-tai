/** 待办数据访问 */
import { db } from '../db/db'
import type { Task } from '../types/entities'
import { createRepository } from './repo'

export const taskRepo = createRepository<Task>(db.tasks)
