/** 日省 store */
import { journalRepo } from '../repositories/journal-repo'
import type { Journal } from '../types/entities'
import { createCrudStore } from './factory'

export const useJournalStore = createCrudStore<Journal>(journalRepo)
