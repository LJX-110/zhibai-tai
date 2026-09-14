/** 分类数据访问（情报 / 藏阁共用，scope 区分） */
import { db } from '../db/db'
import type { Category } from '../types/entities'
import { createRepository } from './repo'

export const categoryRepo = createRepository<Category>(db.categories)
