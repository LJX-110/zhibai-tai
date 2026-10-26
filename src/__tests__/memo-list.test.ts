/**
 * 守墨 · 列表口径
 *
 * 速记与笔记共用 notes 表，所以"谁该出现在首页"必须由这里说清：
 * 只认 kind='memo'，其余两类一条都不能漏进来；顺序固定为新在前。
 */
import { describe, expect, it } from 'vitest'
import { MEMO_FIRST_PAGE, MEMO_MORE_STEP, memosOf, memoTimeLabel } from '../components/memo/memo-list'
import type { Note } from '../types/entities'

function note(kind: Note['kind'], createdAt: string, body = '内容'): Note {
  return {
    id: `${kind}-${createdAt}-${body}`,
    kind,
    title: '',
    body,
    tags: [],
    pinned: false,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('memosOf', () => {
  it('只取速记：记录与灵感都不进首页', () => {
    const notes = [note('note', '2026-10-01T00:00:00.000Z'), note('inspiration', '2026-10-02T00:00:00.000Z'), note('memo', '2026-10-03T00:00:00.000Z')]
    expect(memosOf(notes).map((n) => n.kind)).toEqual(['memo'])
  })

  it('新建的在上', () => {
    const notes = [
      note('memo', '2026-10-01T00:00:00.000Z', '旧'),
      note('memo', '2026-10-03T00:00:00.000Z', '新'),
      note('memo', '2026-10-02T00:00:00.000Z', '中'),
    ]
    expect(memosOf(notes).map((n) => n.body)).toEqual(['新', '中', '旧'])
  })

  it('不改动传入数组（store 快照不能被就地排序）', () => {
    const notes = [note('memo', '2026-10-01T00:00:00.000Z', '旧'), note('memo', '2026-10-02T00:00:00.000Z', '新')]
    memosOf(notes)
    expect(notes[0].body).toBe('旧')
  })

  it('首屏 5 条、每次再展开 10 条', () => {
    expect(MEMO_FIRST_PAGE).toBe(5)
    expect(MEMO_MORE_STEP).toBe(10)
  })
})

describe('memoTimeLabel', () => {
  it('今天只留时刻', () => {
    const iso = new Date(2026, 9, 26, 9, 5).toISOString()
    expect(memoTimeLabel(iso, '2026-10-26')).toBe('09:05')
  })

  it('往日带日期', () => {
    const iso = new Date(2020, 0, 1, 9, 5).toISOString()
    expect(memoTimeLabel(iso, '2026-10-26')).toBe('1月1日 周三')
  })
})
