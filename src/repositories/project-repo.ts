/** 项目中心 数据访问 */
import { db } from '../db/db'
import type { Project } from '../types/entities'
import { createRepository } from './repo'

export const projectRepo = createRepository<Project>(db.projects)
