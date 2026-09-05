/** AI 资源 store */
import { aiResourceRepo } from '../repositories/ai-repo'
import type { AIResource } from '../types/entities'
import { createCrudStore } from './factory'

export const useAIResourceStore = createCrudStore<AIResource>(aiResourceRepo)
