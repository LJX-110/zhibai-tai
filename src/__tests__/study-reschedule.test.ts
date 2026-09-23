/**
 * 单次调课（课程 occurrence 覆盖 · 挪到别的时间）
 *
 * 与「单次停课」是同一套 occurrence 覆盖机制的**另一半**，也是同一个 bug 家族：
 * 停课解决了"这次不上了"，但"老师把周三那节挪到周五"仍然表达不了 ——
 * 只停课的话，新时间那一节谁也认不出来，提醒也只会按原时间（或干脆不响）。
 *
 * 重点守三件事（每一条都对应一个真实后果）：
 *  ① 原时间**不再提醒**（否则调了课还在原时间响）；
 *  ② 新时间**要有提醒**（否则调完反而漏提醒，比不调更糟）；
 *  ③ 课程表要**两边都看得见** —— 原处划掉并写明"调至…"，新处打「调课」标。
 *
 * 还有一条兼容性：`reschedules` 是**可选参数**，不传时行为必须与从前逐位一致。
 */
import { describe, expect, it } from 'vitest'
import { activeSlotsOfDay, daySlotsDetailed, rescheduleOf } from '../services/study'
import { classReminders } from '../services/reminders-study'
import type { Course, CourseReschedule } from '../types/entities'

const course: Course = {
  id: 'c1',
  name: '高等数学',
  room: 'A101',
  schedule: [{ weekday: 3, start: '08:00', end: '09:40' }], // 周三 08:00–09:40
  credit: 4,
  createdAt: '2026-09-01T00:00:00Z',
}

/** 2026-09-23 周三 08:00 → 2026-09-25 周五 10:00（时长沿用 100 分钟） */
const reschedule = (o: Partial<CourseReschedule> = {}): CourseReschedule => ({
  id: 'r1',
  courseId: 'c1',
  date: '2026-09-23',
  start: '08:00',
  toDate: '2026-09-25',
  toStart: '10:00',
  toEnd: '11:40',
  createdAt: '2026-09-20T00:00:00Z',
  ...o,
})

const termStart = '2026-09-07' // 第 1 周周一 → 09-23 是第 3 周周三

describe('rescheduleOf：按「课程 + 日期 + 开始时间」定位一次课', () => {
  it('三项全中才算出', () => {
    expect(rescheduleOf([reschedule()], 'c1', '2026-09-23', '08:00')?.toDate).toBe('2026-09-25')
  })

  it('课程 / 日期 / 节次任一不同都不算', () => {
    expect(rescheduleOf([reschedule()], 'c2', '2026-09-23', '08:00')).toBeUndefined()
    expect(rescheduleOf([reschedule()], 'c1', '2026-09-30', '08:00')).toBeUndefined()
    expect(rescheduleOf([reschedule()], 'c1', '2026-09-23', '10:00')).toBeUndefined()
  })

  it('**没有日期一律视为没调** —— 与停课同一条纪律：宁可不补课，也不凭猜测把课挪走', () => {
    expect(rescheduleOf([reschedule()], 'c1', undefined, '08:00')).toBeUndefined()
    expect(rescheduleOf([reschedule()], 'c1', '', '08:00')).toBeUndefined()
  })

  it('空 / undefined 不崩', () => {
    expect(rescheduleOf([], 'c1', '2026-09-23', '08:00')).toBeUndefined()
    expect(rescheduleOf(undefined, 'c1', '2026-09-23', '08:00')).toBeUndefined()
  })
})

describe('activeSlotsOfDay：调走的剔除、调来的补上', () => {
  it('不传 opts 时行为与从前一致（旧调用方兼容）', () => {
    expect(activeSlotsOfDay([course], 3, 3)).toHaveLength(1)
  })

  it('传了 reschedules → **原日期这一节不再算"要上"**', () => {
    const out = activeSlotsOfDay([course], 3, 3, {
      date: '2026-09-23',
      reschedules: [reschedule()],
    })
    expect(out).toHaveLength(0)
  })

  it('**新日期多出这一节**，时间取 toStart/toEnd', () => {
    const out = activeSlotsOfDay([course], 5, 3, {
      date: '2026-09-25',
      reschedules: [reschedule()],
    })
    expect(out).toHaveLength(1)
    expect(out[0].course.id).toBe('c1')
    expect(out[0].slot.start).toBe('10:00')
    expect(out[0].slot.end).toBe('11:40')
  })

  it('只影响被调的那一天那一次 —— 下一周周三照常上', () => {
    const out = activeSlotsOfDay([course], 3, 4, {
      date: '2026-09-30',
      reschedules: [reschedule()],
    })
    expect(out).toHaveLength(1)
    expect(out[0].slot.start).toBe('08:00')
  })

  it('没有 date 时既不剔除也不补课（定位不到具体哪一天就什么都不做）', () => {
    expect(activeSlotsOfDay([course], 3, 3, { reschedules: [reschedule()] })).toHaveLength(1)
  })

  it('目标课程已删 → 静默跳过，不崩也不显示"未知课程"', () => {
    const out = activeSlotsOfDay([course], 5, 3, {
      date: '2026-09-25',
      reschedules: [reschedule({ courseId: 'gone' })],
    })
    expect(out).toHaveLength(0)
  })
})

describe('daySlotsDetailed：课程表两边都看得见', () => {
  it('原日期：条目保留（不隐藏），带 movedTo 说明调去哪了', () => {
    const out = daySlotsDetailed([course], 3, 3, '2026-09-23', [], [reschedule()])
    expect(out).toHaveLength(1)
    expect(out[0].movedTo?.toStart).toBe('10:00')
    expect(out[0].movedIn).toBe(false)
    expect(out[0].canceled).toBe(false)
  })

  it('目标日期：补上这一节，带 movedIn 标记', () => {
    const out = daySlotsDetailed([course], 5, 3, '2026-09-25', [], [reschedule()])
    expect(out).toHaveLength(1)
    expect(out[0].movedIn).toBe(true)
    expect(out[0].slot.start).toBe('10:00')
  })

  it('不传 reschedules 时行为与从前一致（旧调用方兼容）', () => {
    const out = daySlotsDetailed([course], 3, 3, '2026-09-23', [])
    expect(out).toHaveLength(1)
    expect(out[0].movedTo).toBeNull()
    expect(out[0].movedIn).toBe(false)
  })
})

describe('classReminders：调了课就该按**新时间**提醒', () => {
  // 2026-09-23 周三 07:50 → 距原定的 08:00 还有 10 分钟
  const originNow = new Date(2026, 8, 23, 7, 50)
  // 2026-09-25 周五 09:50 → 距调过去的 10:00 还有 10 分钟
  const movedNow = new Date(2026, 8, 25, 9, 50)

  it('对照组：没调课时，原时间临近会提醒', () => {
    expect(classReminders([course], termStart, originNow, 15).length).toBeGreaterThan(0)
  })

  it('**原时间不再提醒**（修复前这里照样响 —— 与"停课还提醒"是同一个坑）', () => {
    const out = classReminders([course], termStart, originNow, 15, [], [reschedule()])
    expect(out).toHaveLength(0)
  })

  it('**新时间会提醒** —— 漏了这条就是"调完课反倒没人提醒"', () => {
    const out = classReminders([course], termStart, movedNow, 15, [], [reschedule()])
    expect(out.some((r) => r.key === 'class:c1:10:00:2026-09-25')).toBe(true)
  })

  it('调的是别的日期 → 今天照常按原时间提醒', () => {
    const out = classReminders([course], termStart, originNow, 15, [], [
      reschedule({ date: '2026-09-30', start: '08:00' }),
    ])
    expect(out.length).toBeGreaterThan(0)
  })

  it('不传调课参数时行为与从前一致（旧调用方兼容）', () => {
    expect(classReminders([course], termStart, originNow, 15, [], []).length).toBe(
      classReminders([course], termStart, originNow, 15).length,
    )
  })
})
