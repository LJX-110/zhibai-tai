/**
 * 笔记展示工具
 *
 * 标题在数据层是可选的（随手记往往不写标题），但列表与检索都需要一个可辨认的名字。
 * 此前一律回落成「（无题）」，一屏笔记全是同名 —— 既认不出内容，也搜不到。
 * 现按「显式标题 → 正文首行 → （无题）」三级回落，只在展示层推导，不改动存量数据。
 */
import type { Note } from '../types/entities'

const MAX_DERIVED_TITLE = 30

/** 取笔记的展示标题（不改数据） */
export function noteTitle(note: Pick<Note, 'title' | 'body'>): string {
  const explicit = note.title.trim()
  if (explicit) return explicit
  const firstLine = note.body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstLine) return '（无题）'
  return firstLine.length > MAX_DERIVED_TITLE
    ? `${firstLine.slice(0, MAX_DERIVED_TITLE)}…`
    : firstLine
}

/** 落库前补齐标题：标题留空时用正文首行兜底，使搜索与列表有据可依 */
export function withDerivedTitle<T extends Pick<Note, 'title' | 'body'>>(note: T): T {
  if (note.title.trim()) return note
  const derived = noteTitle(note)
  return { ...note, title: derived === '（无题）' ? '' : derived }
}
