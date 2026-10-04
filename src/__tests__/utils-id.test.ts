/**
 * utils/id · 时间展示格式化（2026-10-02 新增 formatDateTime）
 *
 * 同步状态此前直接把 `toISOString()` 原文摆到界面上（2026-10-02T07:54:15.410Z），
 * 用户读不出"这是什么时候"。formatDateTime 是它的唯一实现，口径必须有断言钉住。
 */
import { describe, expect, it } from 'vitest'
import { formatDateTime, formatHM, friendlyDate, shiftDate, todayISO } from '../utils/id'

describe('formatDateTime', () => {
  it('今天的 ISO → 「今天 HH:mm」（本地时区）', () => {
    const iso = `${todayISO()}T15:54:00.000Z`
    expect(formatDateTime(iso)).toBe(`今天 ${formatHM(iso)}`)
  })

  it('昨天的 ISO → 「昨天 HH:mm」', () => {
    const iso = `${shiftDate(todayISO(), -1)}T09:12:00.000Z`
    expect(formatDateTime(iso)).toBe(`昨天 ${formatHM(iso)}`)
  })

  it('更早的日期 → 「M月D日 周X HH:mm」', () => {
    const iso = '2026-01-15T08:05:00.000Z'
    const date = `${new Date(iso).getFullYear()}-${String(new Date(iso).getMonth() + 1).padStart(2, '0')}-${String(new Date(iso).getDate()).padStart(2, '0')}`
    expect(formatDateTime(iso)).toBe(`${friendlyDate(date)} ${formatHM(iso)}`)
  })

  it('非法输入原样返回（不抛出、也不显示 NaN）', () => {
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('不是时间')).toBe('不是时间')
  })
})