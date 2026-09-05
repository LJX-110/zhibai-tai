/** 活动轨迹 数据访问 */
import { db } from '../db/db'
import type { ActivityItem } from '../types/entities'
import { createRepository } from './repo'

export const activityRepo = createRepository<ActivityItem>(db.activityItems)
