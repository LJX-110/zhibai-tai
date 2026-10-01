/** 天机：人设（personas）与长期记忆（memories）的数据访问 */
import { db } from '../db/db'
import type { Memory, Persona } from '../types/entities'
import { createRepository } from './repo'

/** 人设（多行表，随快照同步；删除走墓碑由 repo 工厂负责） */
export const personaRepo = createRepository<Persona>(db.personas)

/** 长期记忆（多行表，随快照同步；删除走墓碑） */
export const memoryRepo = createRepository<Memory>(db.memories)