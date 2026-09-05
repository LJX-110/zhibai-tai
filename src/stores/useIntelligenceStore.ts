/** 情报 store */
import { intelligenceRepo } from '../repositories/intelligence-repo'
import type { IntelligenceItem } from '../types/entities'
import { createCrudStore } from './factory'

export const useIntelligenceStore =
  createCrudStore<IntelligenceItem>(intelligenceRepo)
