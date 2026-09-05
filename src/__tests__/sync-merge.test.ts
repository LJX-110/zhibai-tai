/**
 * 合并/冲突/去重测试
 */
import { describe, expect, it } from 'vitest'
import { mergeAndDetectConflicts } from '../sync/SyncService'
import { dedupeKey } from '../components/source/SourceManager'

const rec = (id: string, ts: string, title: string) => ({ id, updatedAt: ts, title })

describe('mergeAndDetectConflicts (LWW + 冲突检测)', () => {
  it('远端较新则采用远端（无冲突）', async () => {
    // since 设在上次同步之后、两条记录之前：双方都未在 since 之后改动 → 不算冲突
    const since = new Date('2026-08-30T00:00:00Z').getTime()
    const local = { tasks: [rec('a', '2026-08-29T00:00:00Z', '旧')] }
    const remote = { tasks: [rec('a', '2026-08-29T12:00:00Z', '新')] }
    const { merged, conflicts } = mergeAndDetectConflicts(local, remote, since)
    expect(merged.tasks).toHaveLength(1)
    expect((merged.tasks[0] as { title: string }).title).toBe('新')
    expect(conflicts).toHaveLength(0)
  })

  it('双方都在 since 之后修改且不同 → 记录冲突且取较新', async () => {
    const since = new Date('2026-08-28T00:00:00Z').getTime()
    const local = { tasks: [rec('a', '2026-08-29T08:00:00Z', '本地改')] }
    const remote = { tasks: [rec('a', '2026-08-29T09:00:00Z', '远端改')] }
    const { merged, conflicts } = mergeAndDetectConflicts(local, remote, since)
    expect(conflicts).toHaveLength(1)
    expect((merged.tasks[0] as { title: string }).title).toBe('远端改')
  })

  it('仅本地有记录 → 保留', () => {
    const local = { notes: [rec('n1', '2026-08-29T00:00:00Z', '本地')] }
    const { merged } = mergeAndDetectConflicts(local, {}, 0)
    expect(merged.notes).toHaveLength(1)
  })
})

describe('dedupeKey', () => {
  it('优先 source + externalId', () => {
    const a = { source: 'Steam', externalId: '123', title: 'x' }
    const b = { source: 'Steam', externalId: '123', title: 'y' }
    expect(dedupeKey(a)).toBe(dedupeKey(b))
  })
  it('无 externalId 用 title + 日期', () => {
    const a = { source: 'RSS', title: '新闻', publishedAt: '2026-08-29' }
    const b = { source: 'RSS', title: '新闻', publishedAt: '2026-08-29' }
    expect(dedupeKey(a)).toBe(dedupeKey(b))
  })
})
