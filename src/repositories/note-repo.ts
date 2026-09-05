/** 笔记/灵感数据访问 */
import { db } from '../db/db'
import type { Note } from '../types/entities'
import { createRepository } from './repo'

export const noteRepo = createRepository<Note>(db.notes)
