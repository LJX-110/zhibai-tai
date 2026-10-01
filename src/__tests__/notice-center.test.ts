/**
 * 通知中心 · 纯逻辑回归（Step 5-3C 新增能力）
 *
 * 覆盖本轮新加的五个 API 与两条迁移规则：
 *   · `recordNotice` 的**去重合并**（同源 + 同文案在窗口内 → 不叠新条，累加 count 并提到最前）
 *   · `markNoticeRead` / `markAllNoticesRead` / `unreadNoticeCount`
 *   · `dismissNotice`（单条删除）
 *   · `pruneNotices`（按时间退役，容量上限之外的第二种出口）
 *   · **老记录迁移**：v1 历史没有 `read` 字段 —— 必须当**已读**，
 *     否则用户升级后第一次打开会突然冒出几十条未读
 *
 * 这些逻辑住在 localStorage 上（通知不进业务表），所以每个用例先清空存储。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearNoticeHistory,
  dismissNotice,
  listNoticeHistory,
  markAllNoticesRead,
  markNoticeRead,
  pruneNotices,
  recordNotice,
  unreadNoticeCount,
} from '../services/notification'

const KEY = 'zbt:notice-history:v1'

beforeEach(() => {
  localStorage.clear()
})

describe('记入', () => {
  it('记一条 → 未读 · count=1 · 来源与跳转都留着', () => {
    recordNotice('同步失败：网络不可达', '#/system', 'sync', { title: '同步异常', tone: 'danger' })
    const list = listNoticeHistory()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      message: '同步失败：网络不可达',
      hash: '#/system',
      source: 'sync',
      read: false,
      tone: 'danger',
      count: 1,
    })
    expect(unreadNoticeCount()).toBe(1)
  })
})

describe('去重合并', () => {
  it('同源 + 同文案重复 → 合并成一条，count 累加并提到最前', () => {
    recordNotice('同步失败', '#/system', 'sync')
    recordNotice('今日有三件事到期', '#/action', 'task')
    recordNotice('同步失败', '#/system', 'sync')

    const list = listNoticeHistory()
    expect(list).toHaveLength(2)
    expect(list[0].message).toBe('同步失败')
    expect(list[0].count).toBe(2)
    expect(unreadNoticeCount()).toBe(2)
  })

  it('同文案但**不同源** → 不合并（两条各不相同的事）', () => {
    recordNotice('有新内容', '#/intelligence', 'intel')
    recordNotice('有新内容', '#/action', 'task')
    expect(listNoticeHistory()).toHaveLength(2)
  })

  it('`noMerge` 时强制新增', () => {
    recordNotice('同上', undefined, 'app', { noMerge: true })
    recordNotice('同上', undefined, 'app', { noMerge: true })
    expect(listNoticeHistory()).toHaveLength(2)
  })
})

describe('已读', () => {
  it('单条已读只影响那一条', () => {
    recordNotice('A', undefined, 'task')
    recordNotice('B', undefined, 'task')
    const first = listNoticeHistory()[0]
    markNoticeRead(first.id)
    const list = listNoticeHistory()
    expect(list.find((n) => n.id === first.id)?.read).toBe(true)
    expect(unreadNoticeCount(list)).toBe(1)
  })

  it('全部已读 → 未读归零', () => {
    recordNotice('A', undefined, 'task')
    recordNotice('B', undefined, 'class')
    markAllNoticesRead()
    expect(unreadNoticeCount()).toBe(0)
    expect(listNoticeHistory().every((n) => n.read)).toBe(true)
  })

  it('合并会把已读的那条重新变成未读（又发生了一次）', () => {
    recordNotice('同步失败', undefined, 'sync')
    markAllNoticesRead()
    expect(unreadNoticeCount()).toBe(0)
    recordNotice('同步失败', undefined, 'sync')
    const list = listNoticeHistory()
    expect(list).toHaveLength(1)
    expect(list[0].read).toBe(false)
    expect(list[0].count).toBe(2)
  })
})

describe('删除与过期', () => {
  it('dismissNotice 删掉指定一条', () => {
    recordNotice('A', undefined, 'task')
    recordNotice('B', undefined, 'task')
    const target = listNoticeHistory()[0].id
    dismissNotice(target)
    const list = listNoticeHistory()
    expect(list).toHaveLength(1)
    expect(list[0].id).not.toBe(target)
  })

  it('pruneNotices 只退役超过 maxAge 的，返回条数', () => {
    recordNotice('很久以前', undefined, 'task')
    // 手动把那条的时间推到 40 天前（`at` 是 ISO 字符串）
    const raw = JSON.parse(localStorage.getItem(KEY) as string)
    raw[0].at = new Date(Date.now() - 40 * 864e5).toISOString()
    localStorage.setItem(KEY, JSON.stringify(raw))

    recordNotice('刚刚', undefined, 'task')
    const removed = pruneNotices()
    expect(removed).toBe(1)
    const list = listNoticeHistory()
    expect(list).toHaveLength(1)
    expect(list[0].message).toBe('刚刚')
  })
})

describe('老记录迁移', () => {
  it('v1 历史（没有 read 字段）一律按**已读**，不会突然冒出未读', () => {
    // 直接写入旧结构：id / message / at（无 read / tone / count）
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'old-1', message: '昨天的提醒', at: new Date().toISOString() },
        { id: 'old-2', message: '前天的提醒', at: new Date().toISOString() },
      ]),
    )
    const list = listNoticeHistory()
    expect(list).toHaveLength(2)
    expect(list.every((n) => n.read)).toBe(true)
    expect(unreadNoticeCount(list)).toBe(0)
    // 缺失字段补齐为可渲染的默认值
    expect(list[0].tone).toBe('info')
    expect(list[0].count).toBe(1)
  })

  it('存档损坏 → 按空历史处理，不抛', () => {
    localStorage.setItem(KEY, '{坏掉的 JSON')
    expect(listNoticeHistory()).toEqual([])
  })

  it('clearNoticeHistory 清空', () => {
    recordNotice('A', undefined, 'task')
    clearNoticeHistory()
    expect(listNoticeHistory()).toEqual([])
  })
})
