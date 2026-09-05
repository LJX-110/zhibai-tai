/** 身体指标 store */
import { bodyMetricLogRepo, bodyMetricRepo } from '../repositories/body-repo'
import type { BodyMetricDef, BodyMetricLog } from '../types/entities'
import { createCrudStore } from './factory'

export const useBodyMetricStore = createCrudStore<BodyMetricDef>(bodyMetricRepo)
export const useBodyMetricLogStore =
  createCrudStore<BodyMetricLog>(bodyMetricLogRepo)
