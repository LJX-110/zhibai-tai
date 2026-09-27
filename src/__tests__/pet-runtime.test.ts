/**
 * 桌宠 · 运行时位置（移动插值 + 首次落位）
 *
 * 这组用例守的是**「此刻到底在哪」**：一次移动开始之后，任何时刻都能算出真实位置。
 * 此前位置只存终点（视觉交给 CSS `transition` 补间），于是移动中点它一下、抓它一下、
 * 或者旋一下屏，视觉都会从补间中间态**瞬移**过去 —— 而这类问题在看代码时很难发现。
 *
 * 另一半是首次落位的优先级：**本机存档 → 旧业务表字段（legacy 迁移）→ 配置角落**。
 */
import { describe, expect, it } from 'vitest'
import {
  createMovement,
  isMovementDone,
  movementProgress,
  positionAt,
  resolveInitialPosition,
  usableLegacyPosition,
} from '../services/pet/runtime'

const move = (over: Partial<Parameters<typeof createMovement>[0]> = {}) =>
  createMovement({ from: { x: 0, y: 0 }, to: { x: 100, y: 50 }, startAt: 1000, duration: 1000, ...over })

describe('movement：按时间求真实位置', () => {
  it('t=0 在起点、t=duration 在终点', () => {
    const m = move()
    expect(positionAt(m, 1000)).toEqual({ x: 0, y: 0 })
    expect(positionAt(m, 2000)).toEqual({ x: 100, y: 50 })
  })

  it('中途线性插值（与原来的 CSS linear 过渡同一节奏）', () => {
    const m = move()
    expect(positionAt(m, 1500)).toEqual({ x: 50, y: 25 })
    expect(movementProgress(m, 1250)).toBeCloseTo(0.25)
  })

  it('超出时长一律 clamp 到终点（不会"走过站再回来"）', () => {
    const m = move()
    expect(isMovementDone(m, 99999)).toBe(true)
    expect(positionAt(m, 99999)).toEqual({ x: 100, y: 50 })
  })

  it('起始时刻之前也 clamp 到起点（时钟异常 / 提前调用不会倒着走）', () => {
    const m = move()
    expect(positionAt(m, 0)).toEqual({ x: 0, y: 0 })
    expect(movementProgress(m, 0)).toBe(0)
  })

  it('duration 为 0 → 瞬时到位（不做 0 除）', () => {
    const m = move({ duration: 0 })
    expect(movementProgress(m, 1000)).toBe(1)
    expect(positionAt(m, 1000)).toEqual({ x: 100, y: 50 })
  })

  it('**被打断时能拿到"视觉正在哪儿"** —— 这正是本轮要解决的核心问题', () => {
    const m = move()
    // 走到 30% 时被点击 / 抓取打断：此刻真实位置必须是 30%，而不是终点
    const interrupted = positionAt(m, 1300)
    expect(interrupted.x).toBeCloseTo(30)
    expect(interrupted.y).toBeCloseTo(15)
    expect(interrupted.x).not.toBe(100)
  })

  it('非法时间不会算出 NaN（时间源异常时宁可停在起点）', () => {
    expect(Number.isFinite(positionAt(move(), Number.NaN).x)).toBe(true)
  })
})

describe('resolveInitialPosition：首次落位的三来源优先级', () => {
  const anchor = { x: 999, y: 999 }
  const local = { x: 11, y: 22 }
  const legacy = { x: 33, y: 44 }

  it('① 本机存档优先（设备级状态，且无需迁移）', () => {
    expect(resolveInitialPosition({ local, legacy, anchor })).toEqual({
      position: local,
      fromLegacy: false,
    })
  })

  it('② 本机没有时读旧业务表字段，并标记需要写回本机（完成迁移）', () => {
    expect(resolveInitialPosition({ local: null, legacy, anchor })).toEqual({
      position: legacy,
      fromLegacy: true,
    })
  })

  it('③ 都没有时用角落锚点，同样写回本机', () => {
    expect(resolveInitialPosition({ local: null, legacy: null, anchor })).toEqual({
      position: anchor,
      fromLegacy: true,
    })
  })
})

describe('usableLegacyPosition：旧字段算不算"有值"', () => {
  it('{0,0} 视为没有 —— 它同时是"旧版从没写过"的默认行', () => {
    expect(usableLegacyPosition({ x: 0, y: 0 })).toBeNull()
    expect(usableLegacyPosition(null)).toBeNull()
    expect(usableLegacyPosition(undefined)).toBeNull()
  })

  it('非有限值视为没有（存档被写坏时不要拿它定位）', () => {
    expect(usableLegacyPosition({ x: Number.NaN, y: 10 })).toBeNull()
    expect(usableLegacyPosition({ x: 10, y: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('正常值原样返回', () => {
    expect(usableLegacyPosition({ x: 12, y: 34 })).toEqual({ x: 12, y: 34 })
  })
})
