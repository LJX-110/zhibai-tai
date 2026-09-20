/**
 * 固定周期提醒判定（每月固定 / 每周固定）单测
 *
 * 每月固定与每周固定采用同一套"今天是否到期 + 本周/本月是否已做"判定，
 * 这里用镜像的 describe 结构证明二者行为完全对应：
 *   monthlyDay / monthlyDueToday / monthlyDoneThisMonth
 *   weeklyDay  / weeklyDueToday  / weeklyDoneThisWeek
 * 重点覆盖边界：未设置、跨周期（跨月 / 跨周）、周日（weeklyDay=0 起点）。
 */
import { describe, expect, it } from 'vitest'
import {
  monthlyDoneThisMonth,
  monthlyDueToday,
  weeklyDoneThisWeek,
  weeklyDueToday,
} from '../utils/id'

/** 取某日所在周的周一 00:00（本地），与 weeklyDoneThisWeek 内部算法一致 */
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = (x.getDay() + 6) % 7 // 0=周日 → 6，周一 → 0
  x.setDate(x.getDate() - diff)
  x.setHours(0, 0, 0, 0)
  return x
}
const iso = (d: Date) => d.toISOString()

describe('每月固定 monthlyDueToday / monthlyDoneThisMonth', () => {
  const now = new Date(2026, 8, 19) // 2026-09-19，getDate()=19

  it('未设置（缺省 / null）一律不触发', () => {
    expect(monthlyDueToday({})).toBe(false)
    expect(monthlyDueToday({ monthlyDay: null })).toBe(false)
    expect(monthlyDueToday({ monthlyDay: undefined })).toBe(false)
  })

  it('今天 = N 号才到期', () => {
    expect(monthlyDueToday({ monthlyDay: 19 }, now)).toBe(true)
    expect(monthlyDueToday({ monthlyDay: 20 }, now)).toBe(false)
    expect(monthlyDueToday({ monthlyDay: 1 }, now)).toBe(false)
  })

  it('未设置 / 未完成 / 无时间 → 本月未做', () => {
    expect(monthlyDoneThisMonth({ done: false, completedAt: '2026-09-01T00:00:00Z' })).toBe(false)
    expect(monthlyDoneThisMonth({ done: true })).toBe(false)
    expect(monthlyDoneThisMonth({ done: true, completedAt: null })).toBe(false)
  })

  it('本月完成才算（跨月边界）', () => {
    expect(monthlyDoneThisMonth({ done: true, completedAt: '2026-09-15T10:00:00Z' }, now)).toBe(true)
    expect(monthlyDoneThisMonth({ done: true, completedAt: '2026-08-31T10:00:00Z' }, now)).toBe(false)
    expect(monthlyDoneThisMonth({ done: true, completedAt: '2026-10-01T10:00:00Z' }, now)).toBe(false)
  })
})

describe('每周固定 weeklyDueToday / weeklyDoneThisWeek', () => {
  // 找 2026-09 的第一个周日，验证 0=周日 取值域起点
  const findDow = (y: number, m: number, target: number) => {
    const d = new Date(y, m, 1)
    while (d.getDay() !== target) d.setDate(d.getDate() + 1)
    return d
  }
  const sunday = findDow(2026, 8, 0)

  it('未设置（缺省 / null）一律不触发', () => {
    expect(weeklyDueToday({})).toBe(false)
    expect(weeklyDueToday({ weeklyDay: null })).toBe(false)
    expect(weeklyDueToday({ weeklyDay: undefined })).toBe(false)
  })

  it('每个周日：weeklyDay=0 与 now.getDay()=0 对应', () => {
    expect(weeklyDueToday({ weeklyDay: 0 }, sunday)).toBe(true)
    expect(weeklyDueToday({ weeklyDay: 1 }, sunday)).toBe(false)
    expect(weeklyDueToday({ weeklyDay: 6 }, sunday)).toBe(false)
  })

  it('周三：weeklyDay=3 与 getDay()=3 对应', () => {
    const wed = findDow(2026, 8, 3)
    expect(weeklyDueToday({ weeklyDay: 3 }, wed)).toBe(true)
    expect(weeklyDueToday({ weeklyDay: 2 }, wed)).toBe(false)
  })

  it('未设置 / 未完成 / 无时间 → 本周未做', () => {
    const now = new Date(2026, 8, 16, 12, 0, 0)
    expect(weeklyDoneThisWeek({ done: false, completedAt: '2026-09-01T00:00:00Z' }, now)).toBe(false)
    expect(weeklyDoneThisWeek({ done: true }, now)).toBe(false)
    expect(weeklyDoneThisWeek({ done: true, completedAt: null }, now)).toBe(false)
  })

  it('跨周边界：本周一~周日算本周，上周日与下周一不算', () => {
    const now = new Date(2026, 8, 16, 12, 0, 0) // 任意一天，落在某周
    const mon = mondayOf(now)
    const day = (offDays: number, h = 12) => new Date(mon.getTime() + offDays * 86400000 + h * 3600000)

    // 本周一 ~ 本周六：done this week
    expect(weeklyDoneThisWeek({ done: true, completedAt: iso(day(0)) }, now)).toBe(true)
    expect(weeklyDoneThisWeek({ done: true, completedAt: iso(day(2)) }, now)).toBe(true)
    expect(weeklyDoneThisWeek({ done: true, completedAt: iso(day(6)) }, now)).toBe(true) // 本周日
    // 上周日（恰好越过周一界）：上一周
    expect(weeklyDoneThisWeek({ done: true, completedAt: iso(day(-1)) }, now)).toBe(false)
    // 下周一：下一周
    expect(weeklyDoneThisWeek({ done: true, completedAt: iso(day(7)) }, now)).toBe(false)
  })

  it('周日边界：now 为周日时，本周日属本周、上周日属上周', () => {
    const sunNow = findDow(2026, 8, 0)
    const mon = mondayOf(sunNow) // 该周日所在周的周一
    // 同一周的周日（即 sunNow 当天）
    expect(weeklyDoneThisWeek({ done: true, completedAt: iso(sunNow) }, sunNow)).toBe(true)
    // 上周日（周一之前一天）：上一周
    expect(
      weeklyDoneThisWeek({ done: true, completedAt: iso(new Date(mon.getTime() - 86400000)) }, sunNow),
    ).toBe(false)
  })
})
