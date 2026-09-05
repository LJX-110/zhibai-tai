/** 身体指标数据访问 */
import { db } from '../db/db'
import type { BodyMetricDef, BodyMetricLog } from '../types/entities'
import { createRepository } from './repo'

export const bodyMetricRepo = createRepository<BodyMetricDef>(db.bodyMetrics)
export const bodyMetricLogRepo = createRepository<BodyMetricLog>(db.bodyMetricLogs)
