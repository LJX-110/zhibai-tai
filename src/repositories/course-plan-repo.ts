/** 学：选课规划（条目）与选课目标（单行）的数据访问 */
import { db } from '../db/db'
import type { CoursePlan, CoursePlanMeta } from '../types/entities'
import { createRepository } from './repo'
import { createSingletonRepository } from './singleton'

/** 选课条目（多行表，随快照同步；删除走墓碑由 repo 工厂负责） */
export const coursePlanRepo = createRepository<CoursePlan>(db.coursePlans)

/**
 * 选课目标与事项（单行表）。
 *
 * `createEmpty` 里的 **8 / 12 / 1 只是首次运行的起点**（用户当前学校的要求），
 * 不是写死的规则 —— 页面上随时可改；它也只在"从未落库"时被调用一次，
 * 之后读取一律以库里的值为准。
 */
export const coursePlanMetaRepo = createSingletonRepository<CoursePlanMeta>(
  db.coursePlanMeta,
  'coursePlan',
  () => ({
    id: 'coursePlan',
    goals: { limited: 8, public: 12, pe: 1 },
    notes: [],
    updatedAt: '',
  }),
)
