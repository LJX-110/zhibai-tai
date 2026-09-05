/** 活动轨迹 / 关注 store */
import { activityRepo } from '../repositories/activity-repo'
import { followRepo } from '../repositories/follow-repo'
import type { ActivityItem, Follow } from '../types/entities'
import { createCrudStore } from './factory'

export const useActivityStore = createCrudStore<ActivityItem>(activityRepo)
export const useFollowStore = createCrudStore<Follow>(followRepo)
