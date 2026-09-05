/** 笔记/灵感 store */
import { noteRepo } from '../repositories/note-repo'
import type { Note } from '../types/entities'
import { createCrudStore } from './factory'

export const useNoteStore = createCrudStore<Note>(noteRepo)
