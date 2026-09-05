/** 收藏数据访问 */
import { db } from '../db/db'
import type { CollectionItem } from '../types/entities'
import { createRepository } from './repo'

export const collectionRepo = createRepository<CollectionItem>(db.collectionItems)
