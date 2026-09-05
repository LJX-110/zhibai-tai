/** 日省记录数据访问 */
import { db } from '../db/db'
import type { Journal } from '../types/entities'
import { createRepository } from './repo'

export const journalRepo = createRepository<Journal>(db.journals)

/** 某日记录 */
export async function getJournalByDate(date: string) {
  return db.journals.where('date').equals(date).first()
}
