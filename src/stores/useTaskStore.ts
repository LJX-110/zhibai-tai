/** 待办 store */
import { taskRepo } from '../repositories/task-repo'
import type { Task } from '../types/entities'
import { createCrudStore } from './factory'

export const useTaskStore = createCrudStore<Task>(taskRepo)
