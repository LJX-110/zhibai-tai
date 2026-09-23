/**
 * 单次停课（课程 occurrence 覆盖）
 *
 * 这一批修的是用户报过的**「课次取消当周仍触发通知」**。根因不是提醒算错 ——
 * 而是此前**根本没有「取消某一次课」这个概念**：要停课只能删时段或改周次（破坏性操作），
 * 提醒自然无从知道。所以测试的重点是：**停课要真的让提醒消失**，而不只是界面上划掉。
 *
 * 另外守住一条兼容性：`activeSlotsOfDay` 的新参数是**可选的**，
 * 不传时行为必须与从前逐位一致（否则所有旧调用方都会静默改变行为）。
 */
import { describe, expect, it } from 'vitest'
import { activeSlotsOfDay, dateOfWeekday, daySlotsDetailed, isCanceled } from '../services/study'
import { classReminders } from '../services/reminders-study'
import type { Course, CourseCancellation } from '../types/entities'

const course: Course = {
  id: 'c1',
  name: '高等数学',
  room: 'A101',
  schedule: [{ weekday: 3, start: '08:00', end: '09:40' }], // 周三 08:00
  credit: 4,
  createdAt: '2026-09-01T00:00:00Z',
}

const cancellation = (o: Partial<CourseCancellation> = {}): CourseCancellation => ({
  id: 'x1',
  courseId: 'c1',
  date: '2026-09-23',
  start: '08:00',
  createdAt: '2026-09-20T00:00:00Z',
  ...o,
})

describe('isCanceled：按「课程 + 日期 + 开始时间」定位一次课', () => {
  it('三项全中才算停', () => {
    expect(isCanceled([cancellation()], 'c1', '2026-09-23', '08:00')).toBe(true)
  })

  it('课程不同不算', () => {
    expect(isCanceled([cancellation()], 'c2', '2026-09-23', '08:00')).toBe(false)
  })

  it('**日期不同不算** —— 这正是"这周三停、下周三照常"', () => {
    expect(isCanceled([cancellation()], 'c1', '2026-09-30', '08:00')).toBe(false)
  })

  it('同一天的不同节次互不影响', () => {
    expect(isCanceled([cancellation()], 'c1', '2026-09-23', '10:00')).toBe(false)
  })

  it('**没有日期一律视为没停** —— 宁可多提醒，也不要凭猜测把课吞掉', () => {
    expect(isCanceled([cancellation()], 'c1', undefined, '08:00')).toBe(false)
    expect(isCanceled([cancellation()], 'c1', '', '08:00')).toBe(false)
  })

  it('空/undefined 记录不崩', () => {
    expect(isCanceled([], 'c1', '2026-09-23', '08:00')).toBe(false)
    expect(isCanceled(undefined, 'c1', '2026-09-23', '08:00')).toBe(false)
  })
})

describe('activeSlotsOfDay：停课的次被剔除', () => {
  it('不传 opts 时行为与从前一致（旧调用方兼容）', () => {
    expect(activeSlotsOfDay([course], 3, 3)).toHaveLength(1)
  })

  it('传了匹配的停课记录 → 这一节不再出现在"实际要上"里', () => {
    const out = activeSlotsOfDay([course], 3, 3, { date: '2026-09-23', cancellations: [cancellation()] })
    expect(out).toHaveLength(0)
  })

  it('日期对不上 → 照常要上', () => {
    const out = activeSlotsOfDay([course], 3, 3, { date: '2026-09-16', cancellations: [cancellation()] })
    expect(out).toHaveLength(1)
  })
})

describe('daySlotsDetailed：显示与统计分开', () => {
  it('返回**带标记的完整列表**（课程表要显示停掉的课，不能隐藏）', () => {
    const out = daySlotsDetailed([course], 3, 3, '2026-09-23', [cancellation()])
    expect(out).toHaveLength(1)
    expect(out[0].canceled).toBe(true)
  })

  it('没停课的分类标记为 false', () => {
    const out = daySlotsDetailed([course], 3, 3, '2026-09-23', [])
    expect(out[0].canceled).toBe(false)
  })

  it('仍然遵守周次过滤（停课不绕过周次）', () => {
    const odd: Course = { ...course, schedule: [{ weekday: 3, start: '08:00', end: '09:40', weeks: [1, 3] }] }
    expect(daySlotsDetailed([odd], 3, 2, '2026-09-16', [])).toHaveLength(0)
  })
})

describe('dateOfWeekday：周次 + 周几 → 日期', () => {
  it('学期首周周一所在周为第 1 周（与 currentWeek 同口径）', () => {
    // 2026-09-07 是周一 → 第 1 周周一；其周三 = 09-09
    expect(dateOfWeekday('2026-09-07', 1, 3)).toBe('2026-09-09')
  })

  it('周日在同周的末尾（周日属于当周，不是下一周）', () => {
    // 第 1 周周一 09-07 → 周日 09-13
    expect(dateOfWeekday('2026-09-07', 1, 0)).toBe('2026-09-13')
  })

  it('跨周正确推进', () => {
    expect(dateOfWeekday('2026-09-07', 3, 3)).toBe('2026-09-23')
  })

  it('起始日不在周一也能正确归到那一周的周一', () => {
    // 2026-09-09 是周三，仍属 09-07 那一周
    expect(dateOfWeekday('2026-09-09', 1, 1)).toBe('2026-09-07')
  })

  it('缺起始日 / 周次未知 / 非法格式 → null（调用方据此不做停课判断）', () => {
    expect(dateOfWeekday(undefined, 1, 3)).toBeNull()
    expect(dateOfWeekday('2026-09-07', null, 3)).toBeNull()
    expect(dateOfWeekday('2026-09-07', 0, 3)).toBeNull()
    expect(dateOfWeekday('乱七八糟', 1, 3)).toBeNull()
  })
})

describe('classReminders：**停了课就不该再提醒**（用户报过的那个问题）', () => {
  // 2026-09-23 是周三；08:00 上课，now = 07:50 → 差 10 分钟，落在 15 分钟提前量内
  const now = new Date(2026, 8, 23, 7, 50)
  const termStart = '2026-09-07' // 第 1 周周一

  it('正常情况下，临近的课会被提醒（对照组）', () => {
    const out = classReminders([course], termStart, now, 15)
    expect(out.length).toBeGreaterThan(0)
  })

  it('**这一天这一节已停 → 提醒消失**（修复前这里仍会响）', () => {
    const out = classReminders([course], termStart, now, 15, [cancellation({ date: '2026-09-23' })])
    expect(out).toHaveLength(0)
  })

  it('停的是别的日期 → 今天照常提醒', () => {
    const out = classReminders([course], termStart, now, 15, [cancellation({ date: '2026-09-30' })])
    expect(out.length).toBeGreaterThan(0)
  })

  it('停的是同一天别的时间 → 照常提醒', () => {
    const out = classReminders([course], termStart, now, 15, [cancellation({ date: '2026-09-23', start: '10:00' })])
    expect(out.length).toBeGreaterThan(0)
  })

  it('不传停课参数时行为与从前一致（旧调用方兼容）', () => {
    expect(classReminders([course], termStart, now, 15).length).toBe(classReminders([course], termStart, now, 15, []).length)
  })
})
