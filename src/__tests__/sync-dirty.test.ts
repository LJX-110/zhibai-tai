/**
 * 同步标记的并发窗口（2026-10-19）
 *
 * 「同步成功」不等于「本地改动都上去了」：同步开始后、推送完成前用户又改了数据，
 * 这次改动不在本次快照里。`markSynced` 用版本号把这两种情况分开：
 * 期间没有新写入才清标记，否则留给下一次同步（否则那次改动会静默丢失）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const DIRTY_KEY = 'zbt:sync-dirty:v1'

afterEach(() => {
  vi.resetModules()
  try {
    localStorage.removeItem(DIRTY_KEY)
  } catch {
    /* 忽略 */
  }
})

describe('markSynced 的并发窗口', () => {
  it('同步窗口内没有新写入 → 清标记并落盘', async () => {
    const d = await import('../sync/dirty')
    d.markDirty()
    const rev = d.currentSyncRevision()

    expect(d.isDirty()).toBe(true)
    expect(d.markSynced(rev)).toBe(true)
    expect(d.isDirty()).toBe(false)
    expect(localStorage.getItem(DIRTY_KEY)).toBe('0')
  })

  it('同步窗口内又写了数据 → 保留标记（本次快照不完整）', async () => {
    const d = await import('../sync/dirty')
    d.markDirty()
    const rev = d.currentSyncRevision()
    d.markDirty() // 模拟同步进行中用户又改了一条数据

    expect(d.markSynced(rev)).toBe(false)
    expect(d.isDirty()).toBe(true)
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1')
  })

  it('清标记会通知订阅者；重复 markDirty 不会重复通知', async () => {
    const d = await import('../sync/dirty')
    d.markDirty()
    let hits = 0
    const unsub = d.subscribeDirty(() => {
      hits += 1
    })

    d.markDirty() // 已经是脏的：只推进版本号，不再通知
    expect(hits).toBe(0)

    const rev = d.currentSyncRevision()
    d.markSynced(rev)
    unsub()
    expect(hits).toBe(1)
  })
})
