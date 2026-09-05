/** 收藏 store */
import { collectionRepo } from '../repositories/collection-repo'
import type { CollectionItem } from '../types/entities'
import { createCrudStore } from './factory'

export const useCollectionStore =
  createCrudStore<CollectionItem>(collectionRepo)
