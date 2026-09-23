/**
 * 同步状态判定 syncSummary
 *
 * 这一块的核心是**判据**：以「是否已是最新」为准，而不是"上次尝试的结果"。
 * 最容易错的是顺序 —— 上次同步成功、但之后又改过数据，此时数据并不最新；
 * 若显示「已同步」，用户会以为已经推上去了（实际还差一次推送）。
 * 而失败时必然也是脏的，所以「同步失败」必须排在「有改动待同步」之前，
 * 否则真正的问题（权限不对/连不上）会被"有改动"这句话盖住。
 */
import { describe, expect, it } from 'vitest'
import { SYNC_TONE_CLASS, syncSummary } from '../sync/status'

const base = { connected: true, status: 'success' as const, dirty: false }

describe('同步状态判据', () => {
  it('未配齐 → 未连接（哪怕上次状态是成功）', () => {
    const s = syncSummary({ ...base, connected: false })
    expect(s.tone).toBe('idle')
    expect(s.label).toBe('未连接')
  })

  it('正在同步 → 同步中（优先于"有改动"）', () => {
    expect(syncSummary({ ...base, status: 'syncing', dirty: true }).label).toBe('同步中')
  })

  it('上次成功且无本地改动 → 已是最新', () => {
    expect(syncSummary(base).label).toBe('已是最新')
  })

  it('**上次成功但之后有改动 → 有改动待同步**（不是"已同步"）', () => {
    const s = syncSummary({ ...base, dirty: true })
    expect(s.tone).toBe('pending')
    expect(s.label).toBe('有改动待同步')
    expect(s.detail).toContain('尚未推送')
  })

  it('失败优先于"有改动"：失败时必然也是脏的，别把问题盖住', () => {
    const s = syncSummary({ ...base, status: 'error', dirty: true, error: '令牌看不到这个仓库' })
    expect(s.tone).toBe('error')
    expect(s.label).toBe('同步失败')
    expect(s.detail).toBe('令牌看不到这个仓库')
  })

  it('从未同步过、也没改动 → 已是最新（不谎报"已同步"）', () => {
    expect(syncSummary({ ...base, status: 'idle' }).label).toBe('已是最新')
  })
})

describe('状态取色闭集', () => {
  it('五种状态都有点色与文字色（漏一种会静默变成无色）', () => {
    for (const tone of ['idle', 'syncing', 'ok', 'pending', 'error'] as const) {
      expect(SYNC_TONE_CLASS[tone].dot).toBeTruthy()
      expect(SYNC_TONE_CLASS[tone].text).toBeTruthy()
    }
  })
})
