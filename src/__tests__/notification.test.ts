/**
 * 通知基础设施 —— 免打扰判定、关注计数、提醒历史
 *
 * 这个模块此前**零覆盖**，而它错起来的代价很具体：半夜被提醒吵醒（跨零点免打扰算错）、
 * 同一条提醒一天弹十次（跨日去重失效）。这些都是纯函数，正该用单测钉住。
 *
 * 「该提醒什么」的判定已迁往 services/reminders.ts，覆盖在
 * __tests__/reminders.test.ts 与 __tests__/task-repair.test.ts。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNoticeHistory,
  followUpdateCount,
  isQuietNow,
  listNoticeHistory,
  recordNotice,
  shouldAnnounceFollowUpdate,
} from '../services/notification'

beforeEach(() => {
  localStorage.clear()
})

describe('免打扰时段 isQuietNow', () => {
  const at = (h: number, m: number) => new Date(2026, 8, 20, h, m)

  it('同日窗口：左闭右开', () => {
    expect(isQuietNow('13:00', '14:00', at(13, 0))).toBe(true)
    expect(isQuietNow('13:00', '14:00', at(13, 30))).toBe(true)
    // 起点含、终点不含：14:00 整点已经该恢复提醒了
    expect(isQuietNow('13:00', '14:00', at(14, 0))).toBe(false)
    expect(isQuietNow('13:00', '14:00', at(12, 59))).toBe(false)
  })

  it('跨零点：23:00 → 07:00 覆盖整夜', () => {
    expect(isQuietNow('23:00', '07:00', at(23, 30))).toBe(true)
    expect(isQuietNow('23:00', '07:00', at(0, 0))).toBe(true)
    expect(isQuietNow('23:00', '07:00', at(6, 59))).toBe(true)
    // 07:00 起恢复
    expect(isQuietNow('23:00', '07:00', at(7, 0))).toBe(false)
    expect(isQuietNow('23:00', '07:00', at(12, 0))).toBe(false)
    expect(isQuietNow('23:00', '07:00', at(22, 59))).toBe(false)
  })

  it('起止相同视为"不静音"（0 长度窗口，而非全天）', () => {
    // 这里锁的是"退化输入不该变成全天免打扰"——改成 >= 就会整天静音
    expect(isQuietNow('00:00', '00:00', at(0, 0))).toBe(false)
    expect(isQuietNow('09:00', '09:00', at(9, 0))).toBe(false)
  })

  it('非法时间不抛错，按 0 点处理', () => {
    expect(() => isQuietNow('abc', 'def', at(12, 0))).not.toThrow()
    expect(isQuietNow('abc', 'def', at(12, 0))).toBe(false)
  })
})

/* 旧的两组用例（每日去重 claimDailyNotice / 到期提醒 dueTaskNotices）随实现一并移除 ——
 * 它们对应的函数已由 services/reminders.ts 的 taskReminders 与 reminder-claims.ts 的
 * claimReminder 取代，覆盖已迁到 __tests__/reminders.test.ts 与 __tests__/task-repair.test.ts。
 * 留在这里的话，测试会一直给死代码"续命"，让「无死代码」的自检失效。 */

describe('关注更新计数 followUpdateCount', () => {
  const item = (over: Partial<{ title: string; tags: string[]; category?: string; source?: string; read: boolean }>) => ({
    title: '',
    tags: [],
    read: false,
    ...over,
  })

  it('没有关注 或 没有未读 → 0', () => {
    expect(followUpdateCount([], [item({ title: 'AI 周报' })])).toBe(0)
    expect(followUpdateCount([{ keyword: 'AI' }], [item({ title: 'AI 周报', read: true })])).toBe(0)
  })

  it('关键词命中标题 / 标签 / 分类 / 来源任一即算更新', () => {
    expect(followUpdateCount([{ keyword: 'ai' }], [item({ title: 'AI Weekly' })])).toBe(1)
    expect(followUpdateCount([{ keyword: 'rust' }], [item({ tags: ['Rust', 'cli'] })])).toBe(1)
    expect(followUpdateCount([{ keyword: '游戏' }], [item({ category: '游戏' })])).toBe(1)
    expect(followUpdateCount([{ keyword: 'b站' }], [item({ source: 'B站' })])).toBe(1)
  })

  it('大小写不敏感，且只数命中的关键词个数（不数条目数）', () => {
    const items = [item({ title: 'Kimi 发布' }), item({ title: 'Kimi 更新' }), item({ title: '无关' })]
    expect(followUpdateCount([{ keyword: 'kimi' }, { keyword: 'KIMI' }], items)).toBe(2)
    expect(followUpdateCount([{ keyword: 'kimi' }, { keyword: 'deepseek' }], items)).toBe(1)
  })

  it('已读条目不参与命中', () => {
    const items = [item({ title: 'AI 日报', read: true }), item({ title: 'AI 周报' })]
    expect(followUpdateCount([{ keyword: 'ai' }], items)).toBe(1)
  })
})

describe('关注更新是否该提示 shouldAnnounceFollowUpdate', () => {
  it('计数变多才提示', () => {
    expect(shouldAnnounceFollowUpdate(2, 3)).toBe(true)
    expect(shouldAnnounceFollowUpdate(0, 1)).toBe(true)
  })

  it('计数不变 / 变少 / 清零 → 不提示', () => {
    // ⚠️ 这条钉住的是本次修掉的真问题：未读是个稳定值时，
    // 原先"计数 > 0 就按时间窗重发"会让每轮抓取都把同一条再弹一次
    expect(shouldAnnounceFollowUpdate(3, 3)).toBe(false)
    expect(shouldAnnounceFollowUpdate(3, 1)).toBe(false)
    expect(shouldAnnounceFollowUpdate(3, 0)).toBe(false)
    expect(shouldAnnounceFollowUpdate(0, 0)).toBe(false)
  })

  it('首次挂载只记基线，不提示（刷新页面不是新增）', () => {
    expect(shouldAnnounceFollowUpdate(null, 5)).toBe(false)
    expect(shouldAnnounceFollowUpdate(null, 0)).toBe(false)
  })
})

describe('提醒历史 recordNotice / listNoticeHistory', () => {
  it('新的在最前，可清空', () => {
    recordNotice('第一条')
    recordNotice('第二条', '#/study')
    const list = listNoticeHistory()
    expect(list).toHaveLength(2)
    expect(list[0].message).toBe('第二条')
    expect(list[0].hash).toBe('#/study')
    clearNoticeHistory()
    expect(listNoticeHistory()).toEqual([])
  })

  it('上限 50 条，超出后丢最旧的', () => {
    for (let i = 0; i < 60; i++) recordNotice(`第 ${i} 条`)
    const list = listNoticeHistory()
    expect(list).toHaveLength(50)
    expect(list[0].message).toBe('第 59 条')
    expect(list[49].message).toBe('第 10 条')
  })

  it('存档损坏时按空历史处理', () => {
    localStorage.setItem('zbt:notice-history:v1', '坏数据')
    expect(listNoticeHistory()).toEqual([])
  })
})
