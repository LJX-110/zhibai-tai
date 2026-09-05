/** AI 资源数据访问 */
import { db } from '../db/db'
import type { AIResource } from '../types/entities'
import { createRepository } from './repo'

export const aiResourceRepo = createRepository<AIResource>(db.aiResources)
