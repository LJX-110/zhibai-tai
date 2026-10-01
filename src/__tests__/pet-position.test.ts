/**
 * 桌宠 · 位置系统（Step 4-2 · B2）
 *
 * 这一轮把"位置"从物理模拟改成**用户设定**，所以用例全部围绕四条契约：
 *  ① **原点有意义**：可活动矩形不再是"只有尺寸"——移动端要扣掉顶栏与底栏
 *     （否则宠物会盖住底部导航，用户点不到「观 / 行 / 财 / 学」）；
 *  ② **绝不进保留区**：夹回边界时不会落在导航栏 / 状态栏里；
 *  ③ **没有重力**：配置里不再有 physics 段、模块里不再有积分函数
 *     （"一直往下掉"的根因已从代码里移除，不是靠 CSS 盖住）；
 *  ④ **刷新保持**：首次落位优先读本机存档（设备级状态），其次旧字段，最后角落锚点。
 */
import { describe, expect, it } from 'vitest'
import { anchorOf, boundsOf, clampToBounds, petHeight } from '../services/pet/geometry'
import { createMovement, isMovementDone, positionAt, resolveInitialPosition, usableLegacyPosition } from '../services/pet/runtime'
import rawConfig from '../../public/pet/config.json?raw'

/** 桌面：整屏可活动 */
const desktop = { x: 0, y: 0, width: 800, height: 600 }
/** 移动端：顶栏 64 + 底栏 84 被保留（可活动矩形因此有原点） */
const phone = { x: 0, y: 64, width: 390, height: 624 }

describe('可活动矩形：原点参与计算（移动端保留区）', () => {
  it('无原点时与旧语义一致（桌面不受影响）', () => {
    expect(boundsOf(desktop, 160)).toEqual({ left: 8, top: 8, right: 632, bottom: 502 })
  })

  it('有原点时左右上下都平移（宠物不会坐进顶栏 / 底栏）', () => {
    const b = boundsOf(phone, 160)
    expect(b.left).toBe(8)
    expect(b.top).toBe(64 + 8)
    expect(b.right).toBe(390 - 160 - 8)
    // 底边 = 原点 + 高度 - 宠物高 - 边距（16:9 → 160×90）
    expect(b.bottom).toBe(64 + 624 - petHeight(160) - 8)
  })

  it('矩形比宠物还小时，边界仍然可解析（right ≥ left，不会反转）', () => {
    const tiny = boundsOf({ x: 0, y: 40, width: 100, height: 60 }, 160)
    expect(tiny.right).toBeGreaterThanOrEqual(tiny.left)
    expect(tiny.bottom).toBeGreaterThanOrEqual(tiny.top)
  })
})

describe('夹回边界：绝不落进保留区', () => {
  it('拖到屏幕最下方 → 停在底栏之上（bottom 而不是视口底）', () => {
    const b = boundsOf(phone, 160)
    const p = clampToBounds({ x: 100, y: 5000 }, b)
    expect(p.y).toBe(b.bottom)
    expect(p.y).toBeLessThan(phone.y + phone.height)
  })

  it('拖到屏幕最上方 → 停在顶栏之下', () => {
    const b = boundsOf(phone, 160)
    expect(clampToBounds({ x: 100, y: -500 }, b).y).toBe(b.top)
  })

  it('中央是合法位置（可以停在中间 —— 这是本轮的主要诉求）', () => {
    const b = boundsOf(phone, 160)
    const center = { x: Math.round((b.left + b.right) / 2), y: Math.round((b.top + b.bottom) / 2) }
    expect(clampToBounds(center, b)).toEqual(center)
  })
})

describe('首次锚点：同样按原点计算', () => {
  it('右下角锚点落在可活动矩形内', () => {
    const p = anchorOf({ rect: phone, corner: 'bottom-right', marginX: 12, marginY: 96, size: 160 })
    expect(p.x).toBe(phone.x + phone.width - 160 - 12)
    expect(p.y).toBe(phone.y + phone.height - petHeight(160) - 96)
  })

  it('左上角锚点带上原点（不会顶进状态栏）', () => {
    expect(anchorOf({ rect: phone, corner: 'top-left', marginX: 12, marginY: 12, size: 160 })).toEqual({
      x: 12,
      y: phone.y + 12,
    })
  })
})

describe('没有重力 / 甩抛（"一直往下掉"的根因已移除）', () => {
  it('配置文件里不再有 physics 段（重力参数无处可写）', () => {
    const cfg = JSON.parse(rawConfig) as Record<string, unknown>
    expect(cfg.physics).toBeUndefined()
  })

  it('runtime 只有线性插值（无速度、无加速度）：任一时刻的位置只取决于起止与时间', () => {
    const m = createMovement({ from: { x: 0, y: 0 }, to: { x: 100, y: 200 }, startAt: 1000, duration: 100 })
    expect(positionAt(m, 1000)).toEqual({ x: 0, y: 0 })
    expect(positionAt(m, 1050)).toEqual({ x: 50, y: 100 })
    expect(positionAt(m, 1100)).toEqual({ x: 100, y: 200 })
    expect(isMovementDone(m, 1099)).toBe(false)
    expect(isMovementDone(m, 1100)).toBe(true)
    // 时间再往后也不会"继续滑"（旧版重力会一路把宠物拉到底）
    expect(positionAt(m, 999999)).toEqual({ x: 100, y: 200 })
  })
})

describe('刷新后位置保持（本机存档优先）', () => {
  it('本机存档 > 旧字段 > 角落锚点', () => {
    const local = { x: 10, y: 20 }
    const legacy = { x: 30, y: 40 }
    expect(resolveInitialPosition({ local, legacy, anchor: { x: 0, y: 0 } })).toEqual({
      position: local,
      fromLegacy: false,
    })
    expect(resolveInitialPosition({ local: null, legacy, anchor: { x: 0, y: 0 } })).toEqual({
      position: legacy,
      fromLegacy: true,
    })
    expect(resolveInitialPosition({ local: null, legacy: null, anchor: { x: 7, y: 9 } })).toEqual({
      position: { x: 7, y: 9 },
      fromLegacy: true,
    })
  })

  it('旧字段的 {0,0} 视为"从没写过"（否则宠物会被钉死在左上角）', () => {
    expect(usableLegacyPosition({ x: 0, y: 0 })).toBeNull()
    expect(usableLegacyPosition({ x: 1, y: 0 })).toEqual({ x: 1, y: 0 })
    expect(usableLegacyPosition({ x: Number.NaN, y: 5 })).toBeNull()
  })
})