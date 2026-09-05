/** 喝水 store */
import { waterRepo } from '../repositories/water-repo'
import type { WaterLog } from '../types/entities'
import { createCrudStore } from './factory'

export const useWaterStore = createCrudStore<WaterLog>(waterRepo)
