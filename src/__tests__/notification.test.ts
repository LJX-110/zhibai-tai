/**
 * 通知服务 —— 免打扰判定、每日去重、到期提醒、关注计数、提醒历史
 *
 * 这个模块此前**零覆盖**，而它错起来的代价很具体：半夜被提醒吵醒（跨零点免打扰算错）、
 * 同一条提醒一天弹十次（跨日去重失效）、要交的东西没提醒（到期判定漏项）。
 * 这些都是纯函数，正该用单测钉住。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimDailyNotice,
  clearNoticeHistory,
  dueTaskNotices,
  followUpdateCount,
  isQuietNow,
  listNoticeHistory,
  recordNotice,
} from '../services/notification'
import type { Task } from '../types/entities'

/** 与 services/notification.ts 里的私有常量同名 —— 校验"只留今天"这类内部行为必须摸到它 */
const DAILY_KEY = 'zbt:notice-daily:v1'

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

describe('每日去重 claimDailyNotice', () => {
  it('同一键同一天只认领一次', () => {
    expect(claimDailyNotice('class:c1:08:00', '2026-09-20')).toBe(true)
    expect(claimDailyNotice('class:c1:08:00', '2026-09-20')).toBe(false)
    expect(claimDailyNotice('class:c1:08:00', '2026-09-20')).toBe(false)
  })

  it('不同键互不影响', () => {
    expect(claimDailyNotice('a', '2026-09-20')).toBe(true)
    expect(claimDailyNotice('b', '2026-09-20')).toBe(true)
    expect(claimDailyNotice('a', '2026-09-20')).toBe(false)
  })

  it('跨日自动失效（同一节课第二天照常提醒）', () => {
    expect(claimDailyNotice('class:c1:08:00', '2026-09-20')).toBe(true)
    expect(claimDailyNotice('class:c1:08:00', '2026-09-21')).toBe(true)
  })

  it('只保留今天的记录，表不随使用天数增长', () => {
    claimDailyNotice('old-1', '2026-09-18')
    claimDailyNotice('old-2', '2026-09-19')
    claimDailyNotice('today', '2026-09-20')
    const log = JSON.parse(localStorage.getItem(DAILY_KEY)!) as Record<string, string>
    expect(Object.keys(log)).toEqual(['today'])
  })

  it('存档损坏时按"无记录"处理，且不抛错', () => {
    localStorage.setItem(DAILY_KEY, '{不是 JSON')
    // 解析失败被吞掉 → 当作"今天还没提醒过"，于是这一次照常认领成功
    // （最坏结果是多提醒一次，好过整个提醒链路中断）
    expect(() => claimDailyNotice('k', '2026-09-20')).not.toThrow()
    expect(claimDailyNotice('k', '2026-09-20')).toBe(false)
    // 且损坏的存档已被正常的新记录覆盖
    expect(JSON.parse(localStorage.getItem(DAILY_KEY)!)).toEqual({ k: '2026-09-20' })
  })
})

describe('到期提醒 dueTaskNotices', () => {
  const task = (over: Partial<Task>): Task =>
    ({
      id: 't',
      title: '待办',
      description: '',
      done: false,
      priority: 'mid',
      dueDate: null,
      tags: [],
      repeat: 'none',
      projectId: null,
      courseId: null,
      createdAt: '',
      updatedAt: '',
      completedAt: null,
      ...over,
    }) as Task

  it('逾期与今日到期分开成条，逾期在前', () => {
    const out = dueTaskNotices(
      [
        task({ id: 'a', title: '昨天的', dueDate: '2026-09-19' }),
        task({ id: 'b', title: '今天的', dueDate: '2026-09-20' }),
      ],
      '2026-09-20',
    )
    expect(out.map((n) => n.id)).toEqual(['due-overdue', 'due-today'])
    expect(out[0].title).toBe('1 项待办已逾期')
    expect(out[0].body).toBe('昨天的')
    expect(out[1].body).toBe('今天的')
  })

  it('已完成、无到期日、未来到期都不计入', () => {
    expect(
      dueTaskNotices(
        [
          task({ id: 'a', done: true, dueDate: '2026-09-19', completedAt: '2026-09-19T00:00:00Z' }),
          task({ id: 'b', dueDate: null }),
          task({ id: 'c', dueDate: '2026-09-25' }),
        ],
        '2026-09-20',
      ),
    ).toEqual([])
  })

  it('同一条最多列出 3 个标题，避免把通知撑爆', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      task({ id: `t${i}`, title: `事${i}`, dueDate: '2026-09-20' }),
    )
    const out = dueTaskNotices(many, '2026-09-20')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('5 项待办今日到期')
    expect(out[0].body.split(' · ')).toHaveLength(3)
  })
})

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
