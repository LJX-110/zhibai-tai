/**
 * 守墨的纯逻辑 —— 从 notes 里挑速记、排序、给时间标签
 *
 * 与渲染分开的原因：口径要能单测（别的笔记不能漏进来、新旧顺序不能反），
 * 而 MemoBlock 只负责画。
 */
import type { Note } from '../../types/entities'
import { formatHM, friendlyDate, toISODate, todayISO } from '../../utils/id'

/** 首屏条数 */
export const MEMO_FIRST_PAGE = 5
/** 点「展开更多」每次追加的条数 */
export const MEMO_MORE_STEP = 10

/** 只取速记；新建的在上（编辑不改变位置，避免"改个错字就跳到顶上"） */
export function memosOf(notes: readonly Note[]): Note[] {
  return notes
    .filter((n) => n.kind === 'memo')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 今天只留时刻，往日带日期 —— 一行就能读完 */
export function memoTimeLabel(iso: string, today = todayISO()): string {
  const date = toISODate(new Date(iso))
  return date === today ? formatHM(iso) : friendlyDate(date)
}
