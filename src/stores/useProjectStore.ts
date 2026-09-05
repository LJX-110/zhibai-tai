/** 项目中心 store */
import { projectRepo } from '../repositories/project-repo'
import type { Project } from '../types/entities'
import { createCrudStore } from './factory'

export const useProjectStore = createCrudStore<Project>(projectRepo)
