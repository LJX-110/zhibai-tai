/**
 * 课程表周次与冲突判定验证
 *
 * 这些是纯函数，但它们决定了「这周到底上不上这门课」——
 * 算错等于课表骗人，因此逐个守住边界。
 */
import { describe, expect, it } from 'vitest'
import {
  buildWeeks,
  currentWeek,
  describeWeeks,
  parseWeeksForm,
  slotOnWeek,
  slotsOverlap,
  upcomingClasses,
  type WeeksForm,
} from '../services/study'
import type { Course, WeeklySlot } from '../types/entities'

const allWeeks: WeeksForm = { mode: 'all', from: 1, to: 16, custom: '' }

describe('currentWeek', () => {
  it('未设学期起始日返回 null（表示不过滤周次）', () => {
    expect(currentWeek(undefined, '2026-09-12')).toBeNull()
  })

  it('起始日当周即第 1 周', () => {
    expect(currentWeek('2026-09-07', '2026-09-07')).toBe(1)
    expect(currentWeek('2026-09-07', '2026-09-13')).toBe(1)
  })

  it('每过七天进一周', () => {
    expect(currentWeek('2026-09-07', '2026-09-14')).toBe(2)
    expect(currentWeek('2026-09-07', '2026-09-28')).toBe(4)
  })

  it('早于起始日时收敛到第 1 周（不出现第 0 周）', () => {
    expect(currentWeek('2026-09-07', '2026-08-01')).toBe(1)
  })
})

describe('slotOnWeek', () => {
  it('未设置周次 = 每周都上', () => {
    const slot: WeeklySlot = { weekday: 1, start: '08:00', end: '09:40' }
    expect(slotOnWeek(slot, 1)).toBe(true)
    expect(slotOnWeek(slot, 17)).toBe(true)
  })

  it('周次为空数组同样视为每周', () => {
    expect(slotOnWeek({ weekday: 1, start: '08:00', end: '09:40', weeks: [] }, 5)).toBe(true)
  })

  it('指定周次只在该周为真', () => {
    const slot: WeeklySlot = { weekday: 1, start: '08:00', end: '09:40', weeks: [1, 3, 5] }
    expect(slotOnWeek(slot, 3)).toBe(true)
    expect(slotOnWeek(slot, 4)).toBe(false)
  })

  it('week 为 null 时不过滤（未设起始日不该把课表清空）', () => {
    const slot: WeeklySlot = { weekday: 1, start: '08:00', end: '09:40', weeks: [5] }
    expect(slotOnWeek(slot, null)).toBe(true)
  })
})

describe('slotsOverlap', () => {
  const base: WeeklySlot = { weekday: 1, start: '08:00', end: '09:40' }

  it('不同天不冲突', () => {
    expect(slotsOverlap(base, { ...base, weekday: 2 })).toBe(false)
  })

  it('首尾相接不算重叠', () => {
    expect(slotsOverlap(base, { weekday: 1, start: '09:40', end: '11:00' })).toBe(false)
  })

  it('时间真重叠则冲突', () => {
    expect(slotsOverlap(base, { weekday: 1, start: '09:00', end: '10:00' })).toBe(true)
  })

  it('单周与双周同时间不算冲突', () => {
    const odd: WeeklySlot = { weekday: 1, start: '08:00', end: '09:40', weeks: [1, 3, 5] }
    const even: WeeklySlot = { weekday: 1, start: '08:00', end: '09:40', weeks: [2, 4, 6] }
    expect(slotsOverlap(odd, even)).toBe(false)
  })

  it('一方为每周时与任何周次都冲突', () => {
    const odd: WeeklySlot = { weekday: 1, start: '08:00', end: '09:40', weeks: [1, 3, 5] }
    expect(slotsOverlap(odd, base)).toBe(true)
  })
})

describe('buildWeeks / describeWeeks', () => {
  it('每周返回 undefined', () => {
    expect(buildWeeks(allWeeks)).toBeUndefined()
  })

  it('单周与双周按范围筛选', () => {
    expect(buildWeeks({ ...allWeeks, mode: 'odd', from: 1, to: 6 })).toEqual([1, 3, 5])
    expect(buildWeeks({ ...allWeeks, mode: 'even', from: 1, to: 6 })).toEqual([2, 4, 6])
  })

  it('自定义周次去重排序并剔除越界值', () => {
    expect(buildWeeks({ ...allWeeks, mode: 'custom', custom: '5 3，3, 99, 1' })).toEqual([1, 3, 5])
  })

  it('描述与实际周次一致', () => {
    expect(describeWeeks(undefined)).toBe('每周')
    // 「单周 1-8」展开后上界是 7（第 8 周是双周），描述收敛到最后一个真实周次，语义等价
    expect(describeWeeks(buildWeeks({ ...allWeeks, mode: 'odd', from: 1, to: 8 }))).toBe('单周 1-7')
    expect(describeWeeks(buildWeeks({ ...allWeeks, mode: 'even', from: 2, to: 8 }))).toBe('双周 2-8')
    expect(describeWeeks([1, 2, 7])).toBe('第 1、2、7 周')
  })

  it('描述 → 表单可无损还原单双周', () => {
    expect(parseWeeksForm([1, 3, 5, 7]).mode).toBe('odd')
    expect(parseWeeksForm([2, 4, 6, 8]).mode).toBe('even')
    expect(parseWeeksForm([3, 4, 5]).mode).toBe('custom')
    expect(parseWeeksForm(undefined).mode).toBe('all')
  })
})

describe('upcomingClasses', () => {
  const course: Course = {
    id: 'c1',
    name: '毛概',
    room: '博学楼A103',
    credit: 2,
    schedule: [{ weekday: 2, start: '08:00', end: '09:40' }],
    createdAt: '2026-09-01T00:00:00.000Z',
  }

  it('提前 15 分钟内命中', () => {
    // 07:50 → 距 08:00 还有 10 分钟
    expect(upcomingClasses([course], 2, 1, 7 * 60 + 50)).toHaveLength(1)
  })

  it('过早不提醒', () => {
    expect(upcomingClasses([course], 2, 1, 7 * 60 + 30)).toHaveLength(0)
  })

  it('已开课不提醒', () => {
    expect(upcomingClasses([course], 2, 1, 8 * 60 + 5)).toHaveLength(0)
  })

  it('别的星期不提醒', () => {
    expect(upcomingClasses([course], 3, 1, 7 * 60 + 50)).toHaveLength(0)
  })

  it('本周不上课时不提醒（单双周）', () => {
    const oddOnly: Course = {
      ...course,
      schedule: [{ weekday: 2, start: '08:00', end: '09:40', weeks: [1, 3] }],
    }
    expect(upcomingClasses([oddOnly], 2, 2, 7 * 60 + 50)).toHaveLength(0)
    expect(upcomingClasses([oddOnly], 2, 3, 7 * 60 + 50)).toHaveLength(1)
  })
})
