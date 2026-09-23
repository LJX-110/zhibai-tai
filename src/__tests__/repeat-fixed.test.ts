/**
 * 固定周期提醒判定（每日固定 / 每月固定 / 每周固定）单测
 *
 * 三式采用同一套「今天/本周/本月是否到期 + 是否已做」判定，这里用镜像的
 * describe 结构证明三者行为对应：
 *   dailyDoneToday
 *   monthlyDay / monthlyDueToday / monthlyDoneThisMonth
 *   weeklyDay / weeklyDueToday  / weeklyDoneThisWeek
 * 重点覆盖边界：未设置、跨周期（跨日 / 跨周 / 跨月）、周日（weeklyDay=0 起点）、
 * 以及 completedAt 是 UTC 串导致的「本地日期 ≠ ISO 串日期」陷阱。
 *
 * 另有 isFixedSchedule / fixedDoneThisPeriod：把三式收成一个判定，
 * 供完成/撤销固定任务时使用（见 useTaskActions）。
 */
import { describe, expect, it } from 'vitest'
import {
  dailyDoneToday,
  fixedDoneThisPeriod,
  isFixedSchedule,
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

describe('每日固定 dailyDoneToday', () => {
  // 本地 2026-09-20 12:00（用时区无关的方式构造）
  const now = new Date(2026, 8, 20, 12, 0)
  const iso = (d: Date) => d.toISOString()

  it('未完成 / 无完成时间一律不算已做', () => {
    expect(dailyDoneToday({ done: false, completedAt: iso(now) }, now)).toBe(false)
    expect(dailyDoneToday({ done: true }, now)).toBe(false)
    expect(dailyDoneToday({ done: true, completedAt: null }, now)).toBe(false)
  })

  it('今天完成算已做，昨天完成不算（跨日即重新出现）', () => {
    expect(dailyDoneToday({ done: true, completedAt: iso(new Date(2026, 8, 20, 8, 0)) }, now)).toBe(true)
    expect(dailyDoneToday({ done: true, completedAt: iso(new Date(2026, 8, 19, 12, 0)) }, now)).toBe(false)
  })

  it('本地凌晨完成算今天，而不是 ISO 串里的昨天', () => {
    // 本地 2026-09-20 00:30（东八区）→ ISO 串是 2026-09-19T16:30Z。
    // 若实现偷懒用 completedAt.slice(0, 10) 与今天比，这条会判成「没做」，
    // 于是每天凌晨 0-8 点之间做完的事会一直挂在清单上 —— 用 toISODate 转本地日期才对。
    const earlyMorning = new Date(2026, 8, 20, 0, 30).toISOString()
    expect(dailyDoneToday({ done: true, completedAt: earlyMorning }, now)).toBe(true)
  })

  it('完成时间非法时按「没做」处理', () => {
    expect(dailyDoneToday({ done: true, completedAt: '不是时间' }, now)).toBe(false)
  })
})

describe('固定任务统一判定 isFixedSchedule / fixedDoneThisPeriod', () => {
  const base = { done: true, completedAt: new Date(2026, 8, 20, 12, 0).toISOString() }
  const now = new Date(2026, 8, 20, 12, 0) // 2026-09-20 周日

  it('三式都算固定，普通任务不算', () => {
    expect(isFixedSchedule({ repeat: 'daily' })).toBe(true)
    expect(isFixedSchedule({ repeat: 'weekly', weeklyDay: 3 })).toBe(true)
    expect(isFixedSchedule({ repeat: 'monthly', monthlyDay: 20 })).toBe(true)
    expect(isFixedSchedule({ repeat: 'none' })).toBe(false)
    // repeat 是 weekly 但没填锚点：不是固定任务，走旧的"完成后生成下一条"
    expect(isFixedSchedule({ repeat: 'weekly' })).toBe(false)
  })

  it('本期已做按 每月 > 每周 > 每日 取优先级', () => {
    // 每月锚点命中今天 → 本月已做
    expect(fixedDoneThisPeriod({ ...base, repeat: 'monthly', monthlyDay: 20 }, now)).toBe(true)
    // 上月完成 → 本月未做（"本期"看月，不看锚点是否正好是今天）
    expect(
      fixedDoneThisPeriod(
        { done: true, completedAt: new Date(2026, 7, 20, 12, 0).toISOString(), repeat: 'monthly', monthlyDay: 21 },
        now,
      ),
    ).toBe(false)
    // 每周锚点 0=周日，今天是周日 → 本周已做
    expect(fixedDoneThisPeriod({ ...base, repeat: 'weekly', weeklyDay: 0 }, now)).toBe(true)
    // 每日：今天已完成 → 已做
    expect(fixedDoneThisPeriod({ ...base, repeat: 'daily' }, now)).toBe(true)
  })

  it('本期未做时返回 false（固定任务的完成/撤销都依赖这个判定）', () => {
    expect(
      fixedDoneThisPeriod(
        { done: false, completedAt: null, repeat: 'daily' },
        now,
      ),
    ).toBe(false)
  })
})

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

  it('每月 1 号凌晨完成也算本月 —— completedAt 是 UTC 串，不能直接切年月', () => {
    /* 本地 9/1 00:30（东八区）存库是 2026-08-31T16:30Z，`slice(0,7)` 会得到 "2026-08"，
     * 于是任务被判成「本月未完成」而**重新冒出** —— 与 dailyDoneToday 注释里
     * 警告的是同一个坑，此前月度这一处漏了。 */
    const at = new Date(2026, 8, 1, 0, 30) // 本地 2026-09-01 00:30
    expect(monthlyDoneThisMonth({ done: true, completedAt: at.toISOString() }, at)).toBe(true)
  })

  it('每月最后一天深夜完成也算本月（同一边界的另一侧）', () => {
    const at = new Date(2026, 8, 30, 23, 30) // 本地 2026-09-30 23:30
    expect(monthlyDoneThisMonth({ done: true, completedAt: at.toISOString() }, at)).toBe(true)
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
