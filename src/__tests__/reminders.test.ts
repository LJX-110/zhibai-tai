/**
 * 统一提醒引擎 —— 各提醒源的判定
 *
 * 这里的错误代价很具体：要交的没提醒（漏）、半夜被吵醒（错）、同一件事弹十遍（吵）。
 * 全部判定都是纯函数，逐源钉死：
 *  · 待办 / 固定任务：今天到期才提醒（清单看"本期做没做"，提醒看"今天到不到期"，两回事）
 *  · 课程：15 分钟窗口 + 单双周过滤 + 当日概览（今天上完就不报）
 *  · 作业 / 考试：逾期与临近（此前**完全无通知**）
 *  · 习惯 / 喝水：过了晚间门槛仍未达标才说（早上提醒是催，晚上提醒是收尾）
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  classReminders,
  collectReminders,
  examReminders,
  fixedReminders,
  habitReminders,
  homeworkReminders,
  taskReminders,
  waterReminders,
} from '../services/reminders'
import { claimReminder } from '../services/reminder-claims'
import { toISODate } from '../utils/id'
import type { Course, Exam, Habit, HabitLog, Homework, Task, WaterLog } from '../types/entities'

beforeEach(() => {
  localStorage.clear()
})

/** 构造一个确定的周日作为"今天"，避免用例依赖具体日期的星期 */
const SUNDAY = (() => {
  const d = new Date(2026, 8, 20)
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  return d
})()

const at = (base: Date, h: number, min = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, min)
const day = (x: Date) => toISODate(x)

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
    monthlyDay: null,
    weeklyDay: null,
    projectId: null,
    courseId: null,
    createdAt: '',
    updatedAt: '',
    completedAt: null,
    ...over,
  }) as Task

const homework = (over: Partial<Homework>): Homework => ({
  id: 'h',
  title: '作业',
  courseId: null,
  done: false,
  dueDate: null,
  note: '',
  createdAt: '',
  updatedAt: '',
  ...over,
})

const exam = (over: Partial<Exam>): Exam => ({
  id: 'e',
  title: '考试',
  courseId: null,
  date: '',
  time: undefined,
  location: undefined,
  note: '',
  createdAt: '',
  updatedAt: '',
  ...over,
})

const habit = (over: Partial<Habit>): Habit => ({
  id: 'hb',
  name: '习惯',
  targetPerDay: 1,
  unit: undefined,
  order: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
})

const habitLog = (over: Partial<HabitLog>): HabitLog => ({
  id: 'hl',
  habitId: 'hb',
  date: '',
  count: 1,
  note: undefined,
  createdAt: '',
  updatedAt: '',
  ...over,
})

const water = (over: Partial<WaterLog>): WaterLog => ({
  id: 'w',
  date: '',
  amountMl: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
})

const course = (
  id: string,
  name: string,
  weekday: number,
  start: string,
  end: string,
  weeks?: number[],
): Course => ({ id, name, schedule: [{ weekday, start, end, weeks }], credit: 2, createdAt: '', updatedAt: '' })

describe('待办提醒 taskReminders', () => {
  const today = day(SUNDAY)
  const shift = (n: number) => day(new Date(SUNDAY.getFullYear(), SUNDAY.getMonth(), SUNDAY.getDate() + n))

  it('今日到期 → 提醒；已完成 / 无截止 / 未来截止 → 不提醒', () => {
    const out = taskReminders(
      [
        task({ id: 'a', title: '今天的', dueDate: today }),
        task({ id: 'b', done: true, dueDate: today, completedAt: SUNDAY.toISOString() }),
        task({ id: 'c', dueDate: null }),
        task({ id: 'd', title: '三天后', dueDate: shift(3) }),
      ],
      today,
    )
    expect(out.map((r) => r.title)).toEqual(['今天的'])
    expect(out[0].tone).toBe('info')
    expect(out[0].critical).toBe(false)
  })

  it('逾期 → critical + danger，且键细到每一项（当天新增也能提醒）', () => {
    const out = taskReminders(
      [task({ id: 'a', title: '昨天的', dueDate: shift(-1) }), task({ id: 'b', title: '前天的', dueDate: shift(-2) })],
      today,
    )
    expect(out).toHaveLength(2)
    expect(out.every((r) => r.critical && r.tone === 'danger')).toBe(true)
    expect(new Set(out.map((r) => r.key)).size).toBe(2)
  })
})

describe('固定任务提醒 fixedReminders', () => {
  const now = at(SUNDAY, 9)

  it('每日固定：本期未做 → 提醒；本期已做 → 不提醒', () => {
    const doneToday = task({
      id: 'd1',
      title: '已做的',
      repeat: 'daily',
      done: true,
      completedAt: SUNDAY.toISOString(),
    })
    const open = task({ id: 'd2', title: '没做的', repeat: 'daily' })
    const out = fixedReminders([doneToday, open], now)
    expect(out.map((r) => r.title)).toEqual(['没做的'])
    expect(out[0].period).toBe(day(SUNDAY))
  })

  it('每周固定：今天到期且本周未做 → 提醒；今天不是到期日 → 不提醒', () => {
    // SUNDAY 已归一化为周日
    const dueToday = task({ id: 'w1', title: '周日复盘', repeat: 'weekly', weeklyDay: 0 })
    const otherDay = task({ id: 'w2', title: '周三复盘', repeat: 'weekly', weeklyDay: 3 })
    const out = fixedReminders([dueToday, otherDay], now)
    expect(out.map((r) => r.title)).toEqual(['周日复盘'])
    expect(out[0].period).toMatch(/^w\d{4}-\d{2}-\d{2}$/)
  })

  it('每月固定：今天不是 N 号 → 不提醒（提醒看到期日，不看本期做没做）', () => {
    const due = task({ id: 'm1', title: '27 号交话费', repeat: 'monthly', monthlyDay: SUNDAY.getDate() })
    const notToday = task({ id: 'm2', title: '月底记账', repeat: 'monthly', monthlyDay: 27 })
    const out = fixedReminders([due, notToday], now)
    expect(out.map((r) => r.title)).toEqual(['27 号交话费'])
    expect(out[0].period).toBe(day(SUNDAY).slice(0, 7))
  })
})

describe('课程提醒 classReminders', () => {
  const monday = (() => {
    const d = new Date(SUNDAY)
    d.setDate(d.getDate() + 1)
    return d
  })()
  const termStart = day(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7))
  const now = at(monday, 7, 50) // 周一 07:50，08:00 的课还有 10 分钟

  it('进入 15 分钟窗口 → critical 提醒，带教室', () => {
    const out = classReminders([course('c1', '高数', 1, '08:00', '09:40')], termStart, now)
    const ahead = out.filter((r) => r.kind === 'class-ahead')
    expect(ahead).toHaveLength(1)
    expect(ahead[0].title).toContain('高数')
    expect(ahead[0].title).toContain('10 分钟后')
    expect(ahead[0].critical).toBe(true)
  })

  it('过早 / 已开课 → 无提前提醒；当天还有课 → 有概览', () => {
    const early = classReminders([course('c1', '高数', 1, '08:00', '09:40')], termStart, at(monday, 6, 0))
    expect(early.filter((r) => r.kind === 'class-ahead')).toHaveLength(0)
    expect(early.find((r) => r.kind === 'classes')?.title).toContain('下一节 高数 08:00')

    const late = classReminders([course('c1', '高数', 1, '08:00', '09:40')], termStart, at(monday, 9, 30))
    expect(late.filter((r) => r.kind === 'class-ahead')).toHaveLength(0)
    // 今天全上完就不报概览（旧版会把第一节当"下一节"再报一次）
    expect(late.find((r) => r.kind === 'classes')).toBeUndefined()
  })

  it('这周不上的课（单双周）既不提前提醒也不进概览', () => {
    // 周一起算第 1 周 → 今天是第 2 周；这门课只在第 1 周上
    const out = classReminders([course('c1', '单周课', 1, '08:00', '09:40', [1])], termStart, now)
    expect(out).toHaveLength(0)
  })
})

describe('作业与考试提醒（此前零通知）', () => {
  const today = day(SUNDAY)
  const shift = (n: number) => day(new Date(SUNDAY.getFullYear(), SUNDAY.getMonth(), SUNDAY.getDate() + n))

  it('作业：逾期 critical / 今天截止 critical / 明天 info / 三天后不提醒 / 已交不提醒', () => {
    const out = homeworkReminders(
      [
        homework({ id: 'a', title: '已逾期', dueDate: shift(-1) }),
        homework({ id: 'b', title: '今天交', dueDate: shift(0) }),
        homework({ id: 'c', title: '明天交', dueDate: shift(1) }),
        homework({ id: 'd', title: '三天后', dueDate: shift(3) }),
        homework({ id: 'e', title: '已交', done: true, dueDate: shift(0) }),
        homework({ id: 'f', title: '无截止', dueDate: null }),
      ],
      today,
    )
    expect(out.map((r) => r.title)).toEqual(['已逾期（逾期 1 天）', '今天交（今天截止）', '明天交（明天截止）'])
    expect(out[0].critical).toBe(true)
    expect(out[1].critical).toBe(true)
    expect(out[2].critical).toBe(false)
  })

  it('考试：剩 3 / 1 / 0 天各提醒一次，中间天数不打扰', () => {
    const exams: Exam[] = [
      exam({ id: 'a', title: '三天后考', date: shift(3) }),
      exam({ id: 'b', title: '两天后考', date: shift(2) }),
      exam({ id: 'c', title: '明天考', date: shift(1) }),
      exam({ id: 'd', title: '今天考', date: shift(0) }),
      exam({ id: 'e', title: '十天后考', date: shift(10) }),
    ]
    const out = examReminders(exams, today)
    expect(out.map((r) => r.title)).toEqual([
      '三天后考（三天后考试）',
      '明天考（明天考试）',
      '今天考（今天考试）',
    ])
    expect(out.filter((r) => r.critical).map((r) => r.title)).toEqual([
      '明天考（明天考试）',
      '今天考（今天考试）',
    ])
  })
})

describe('习惯与喝水提醒（晚间门槛）', () => {
  const today = day(SUNDAY)
  const night = at(SUNDAY, 21, 5)
  const morning = at(SUNDAY, 9, 0)

  it('门槛前不提醒（早上提醒是催，晚上提醒是收尾）', () => {
    const out = habitReminders([habit({ id: 'hb1', name: '读书', targetPerDay: 2, unit: '页' })], [], morning)
    expect(out).toHaveLength(0)
    expect(waterReminders([water({ date: today, amountMl: 0 })], 2000, morning)).toHaveLength(0)
  })

  it('门槛后未达标 → 提醒，带进度；已达标 → 不提醒', () => {
    const out = habitReminders(
      [
        habit({ id: 'hb1', name: '读书', targetPerDay: 2, unit: '页' }),
        habit({ id: 'hb2', name: '已达标', targetPerDay: 1 }),
      ],
      [habitLog({ id: 'hl1', habitId: 'hb2', date: today, count: 1 })],
      night,
    )
    expect(out.map((r) => r.title)).toEqual(['读书（0/2页）'])

    const waterOut = waterReminders([water({ date: today, amountMl: 1200 })], 2000, night)
    expect(waterOut).toHaveLength(1)
    expect(waterOut[0].title).toBe('今天还差 800ml 水（1200/2000）')
    expect(waterReminders([water({ date: today, amountMl: 2000 })], 2000, night)).toHaveLength(0)
  })
})

describe('去重与汇总', () => {
  it('同键同期只认领一次；跨键、跨期间不受影响', () => {
    expect(claimReminder('fixed:daily:t1:2026-09-21', '2026-09-21')).toBe(true)
    expect(claimReminder('fixed:daily:t1:2026-09-21', '2026-09-21')).toBe(false)
    expect(claimReminder('fixed:daily:t2:2026-09-21', '2026-09-21')).toBe(true)
    // 每月固定认领的是"本月"，跨天不失效 —— 这正是不能用 claimDailyNotice 的原因
    expect(claimReminder('fixed:monthly:m1:2026-09', '2026-09')).toBe(true)
    expect(claimReminder('fixed:monthly:m1:2026-09', '2026-09')).toBe(false)
  })

  it('collectReminders 按紧急程度排序（即将上课最先）', () => {
    const monday = (() => {
      const d = new Date(SUNDAY)
      d.setDate(d.getDate() + 1)
      return d
    })()
    const termStart = day(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7))
    const out = collectReminders(
      {
        tasks: [task({ id: 't1', title: '今天的待办', dueDate: day(monday) })],
        courses: [course('c1', '高数', 1, '08:00', '09:40')],
        homeworks: [homework({ id: 'h1', title: '今天交的作业', dueDate: day(monday) })],
        exams: [exam({ id: 'e1', title: '明天的考试', date: day(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1)) })],
        habits: [],
        habitLogs: [],
        waterLogs: [],
        waterGoalMl: 2000,
        termStartDate: termStart,
      },
      at(monday, 7, 50),
    )
    expect(out[0].kind).toBe('class-ahead')
    // 同一时刻该提醒的事都在：课（提前量） / 考试 / 作业 / 待办 / 课表概览
    expect(out.map((r) => r.kind)).toEqual(['class-ahead', 'exams', 'homeworks', 'tasks', 'classes'])
  })
})
