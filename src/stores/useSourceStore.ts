/** 情报源 store */
import { sourceRepo } from '../repositories/source-repo'
import type { IntelligenceSource } from '../types/entities'
import { createCrudStore } from './factory'

export const useSourceStore = createCrudStore<IntelligenceSource>(sourceRepo)
