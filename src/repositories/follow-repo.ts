/** 关注 数据访问 */
import { db } from '../db/db'
import type { Follow } from '../types/entities'
import { createRepository } from './repo'

export const followRepo = createRepository<Follow>(db.follows)
