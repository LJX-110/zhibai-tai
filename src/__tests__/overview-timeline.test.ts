/**
 * 观 · 今日任务时间轴（Step 5-1 · E3）
 *
 * 要钉住的是一条**用户直接看得见**的规则：同一件待办在首屏**只出现一次**。
 * 改这条规则之前，"今天到期的重点待办"会同时落进「今日任务」与「到期提醒」两块，
 * 用户得先心算"这两条是不是同一件"。
 */
import { describe, expect, it } from 'vitest'
import { TIMELINE_GROUPS, buildTodayTimeline } from '../pages/overview/shared'
import type { Task } from '../types/entities'

const TODAY = '2026-09-29'

function task(id: string, dueDate?: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: `待办 ${id}`,
    description: '',
    done: false,
    priority: 'mid',
    dueDate,
    tags: [],
    repeat: 'none',
    projectId: null,
    courseId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedAt: null,
    ...over,
  } as Task
}

const ids = (rows: ReturnType<typeof buildTodayTimeline>) => rows.map((r) => r.task.id)
const bucketOf = (rows: ReturnType<typeof buildTodayTimeline>, id: string) =>
  rows.find((r) => r.task.id === id)?.bucket

describe('buildTodayTimeline —— 同一件事只出现一次', () => {
  it('**今天到期的重点待办同时出现在两个来源里时，结果里只有一条**', () => {
    const t = task('a', TODAY)
    // 它既是"今天到期"（todayDue），又是"今日重点"（focus）—— 改前会渲染两次
    const rows = buildTodayTimeline([t], [], [t], TODAY)
    expect(ids(rows)).toEqual(['a'])
    expect(bucketOf(rows, 'a')).toBe('today')
  })

  it('同时是"临近到期"与"今日重点"也一样只有一条', () => {
    const t = task('b', '2026-10-01')
    const rows = buildTodayTimeline([], [t], [t], TODAY)
    expect(ids(rows)).toEqual(['b'])
    expect(bucketOf(rows, 'b')).toBe('soon')
  })

  it('重复 id 只在**先到的来源**里算一次（越靠前越权威）', () => {
    const t = task('c', '2026-09-20') // 已逾期
    const rows = buildTodayTimeline([t], [t], [t], TODAY)
    expect(ids(rows)).toEqual(['c'])
    expect(bucketOf(rows, 'c')).toBe('overdue')
  })
})

describe('分桶：逾期 / 今天 / 临近', () => {
  it('到期日早于今天 = 逾期；等于今天 = 今天；1~3 天内 = 临近', () => {
    const rows = buildTodayTimeline(
      [task('over', '2026-09-20'), task('on', TODAY)],
      [task('soon', '2026-10-01')],
      [],
      TODAY,
    )
    expect(bucketOf(rows, 'over')).toBe('overdue')
    expect(bucketOf(rows, 'on')).toBe('today')
    expect(bucketOf(rows, 'soon')).toBe('soon')
  })

  it('**没有到期日的重点待办**归到"今天"，不会被丢掉（原本就只出现在这一块）', () => {
    const rows = buildTodayTimeline([], [], [task('nodate')], TODAY)
    expect(ids(rows)).toEqual(['nodate'])
    expect(bucketOf(rows, 'nodate')).toBe('today')
  })

  it('三个来源全空 → 空时间轴（调用方据此显示空态）', () => {
    expect(buildTodayTimeline([], [], [], TODAY)).toEqual([])
  })

  it('分组顺序 = 紧迫度（逾期 → 今天 → 临近），且分组标题齐备', () => {
    expect(TIMELINE_GROUPS.map((g) => g.key)).toEqual(['overdue', 'today', 'soon'])
    expect(TIMELINE_GROUPS.map((g) => g.label)).toEqual(['逾期', '今天', '临近'])
  })

  it('同名但 id 不同的两条待办**都要保留**（去重按 id，不按标题）', () => {
    const a = task('x1', TODAY, { title: '写周报' })
    const b = task('x2', TODAY, { title: '写周报' })
    const rows = buildTodayTimeline([a, b], [], [], TODAY)
    expect(ids(rows)).toEqual(['x1', 'x2'])
  })
})

describe('时间轴按「时刻」排序（Step 5-2C #1 · 待办加可选时刻）', () => {
  it('同一段内：**有时刻的按时刻排前**，没填时刻的留在后面', () => {
    const early = task('e', TODAY, { dueTime: '08:30' })
    const late = task('l', TODAY, { dueTime: '20:00' })
    const none = task('n', TODAY)
    const rows = buildTodayTimeline([none, late, early], [], [], TODAY)
    expect(ids(rows)).toEqual(['e', 'l', 'n'])
  })

  it('都没填时刻 → 保持原有相对顺序（稳定排序，不因排序打乱录入顺序）', () => {
    const a = task('a', TODAY)
    const b = task('b', TODAY)
    const c = task('c', TODAY)
    expect(ids(buildTodayTimeline([a, b, c], [], [], TODAY))).toEqual(['a', 'b', 'c'])
  })

  it('不填时刻时行为与从前完全一致（可选字段不带副作用）', () => {
    const rows = buildTodayTimeline([task('x', TODAY)], [], [], TODAY)
    expect(ids(rows)).toEqual(['x'])
    expect(rows[0].task.dueTime).toBeUndefined()
  })
})
