/**
 * 桌宠 · 几何（尺寸与边界）
 *
 * 这组用例守的是**只有一个尺寸真相**：`effectiveSize = baseSize × scale`。
 * 此前 `config.json` 的 `size` 与组件里的 `VIEW_SIZE` 是两个独立字面量、靠注释人工对齐 ——
 * 只改一处就会出现"渲染多大"与"能走到哪"对不上，而且**不报错**。
 *
 * 另一半是**边界语义**：宠物整体（含 16:9 画布）永不越出宿主矩形；
 * 宿主矩形比宠物还小时上下界重合而不是反转；**矩形的原点自 2026-09-28 起参与计算**
 * （移动端靠它扣掉顶栏 / 底栏，见 pet-position.test.ts）。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PET_SCALE,
  PET_ASPECT_H,
  PET_MARGIN,
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  anchorOf,
  boundsOf,
  clampPetScale,
  clampToBounds,
  effectiveSize,
  petHeight,
  PET_SCALE_STEPS,
  nearestPetScale,
  petScaleKeyOf,
} from '../services/pet/geometry'
import type { Corner } from '../services/pet/types'

describe('petHeight：16:9 换算只有这一处', () => {
  it('160 → 90', () => {
    expect(petHeight(160)).toBe(90)
  })

  it('比例就是 9/16', () => {
    expect(PET_ASPECT_H).toBeCloseTo(0.5625, 10)
  })
})

describe('clampPetScale / effectiveSize', () => {
  it('区间内原样返回', () => {
    expect(clampPetScale(1)).toBe(1)
    expect(clampPetScale(0.9)).toBeCloseTo(0.9)
    expect(clampPetScale(1.4)).toBeCloseTo(1.4)
  })

  it('越界夹回上下限（不做"悄悄放行"）', () => {
    expect(clampPetScale(0.1)).toBe(PET_SCALE_MIN)
    expect(clampPetScale(9)).toBe(PET_SCALE_MAX)
  })

  it('非法值退回默认 1（不能让宠物凭空消失或撑满屏幕）', () => {
    expect(clampPetScale(Number.NaN)).toBe(DEFAULT_PET_SCALE)
    expect(clampPetScale(undefined)).toBe(DEFAULT_PET_SCALE)
    expect(clampPetScale('1.2')).toBe(DEFAULT_PET_SCALE)
    expect(clampPetScale(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PET_SCALE)
  })

  it('effectiveSize = baseSize × scale', () => {
    expect(effectiveSize(160, 1)).toBeCloseTo(160)
    expect(effectiveSize(160, 0.8)).toBeCloseTo(128)
    expect(effectiveSize(160, 1.4)).toBeCloseTo(224)
    // 非法 scale 退回默认，不会把尺寸算成 0 或 Infinity
    expect(effectiveSize(160, Number.NaN)).toBeCloseTo(160)
  })
})

describe('boundsOf：可活动边界', () => {
  const rect = { x: 0, y: 0, width: 800, height: 600 }

  it('按 effectiveSize 推高度，四周留边距', () => {
    // 800 - 160 - 8 = 632；600 - 90 - 8 = 502
    expect(boundsOf(rect, 160)).toEqual({ left: 8, top: 8, right: 632, bottom: 502 })
  })

  it('**缩放后边界跟着变**（这正是"第二个尺寸真相"会漏掉的地方）', () => {
    const small = boundsOf(rect, effectiveSize(160, 0.8)) // 128 → 高 72
    const big = boundsOf(rect, effectiveSize(160, 1.4)) // 224 → 高 126
    expect(small.right).toBe(800 - 128 - PET_MARGIN)
    expect(small.bottom).toBe(600 - 72 - PET_MARGIN)
    expect(big.right).toBe(800 - 224 - PET_MARGIN)
    expect(big.bottom).toBe(600 - 126 - PET_MARGIN)
  })

  it('宿主矩形比宠物还小时，上下界重合而不是反转（否则会在两界间来回夹）', () => {
    const tiny = boundsOf({ x: 0, y: 0, width: 100, height: 60 }, 160)
    expect(tiny.right).toBeGreaterThanOrEqual(tiny.left)
    expect(tiny.bottom).toBeGreaterThanOrEqual(tiny.top)
  })

  it('**原点参与计算**（2026-09-28 起）：移动端的可活动矩形有 y 偏移，边界整体平移', () => {
    // 顶栏 64 + 底栏 84 被布局保留 → 可活动矩形 { x:0, y:64, w:390, h:624 }
    const shifted = boundsOf({ x: 0, y: 64, width: 390, height: 624 }, 160)
    expect(shifted.top).toBe(64 + PET_MARGIN)
    expect(shifted.bottom).toBe(64 + 624 - petHeight(160) - PET_MARGIN)
    // 左侧同理（横屏刘海时 rect.x 可能非 0）
    expect(boundsOf({ x: 30, y: 0, width: 390, height: 624 }, 160).left).toBe(30 + PET_MARGIN)
  })
})

describe('clampToBounds：把宠物拉回边界内', () => {
  const b = boundsOf({ x: 0, y: 0, width: 600, height: 800 }, 160)

  it('**矩形变窄后不再卡在外面**（否则 planMove 两向都越界、宠物永久失踪）', () => {
    const r = clampToBounds({ x: 1200, y: 700 }, b)
    expect(r.x).toBeLessThanOrEqual(b.right)
    expect(r.y).toBeLessThanOrEqual(b.bottom)
  })

  it('负数位置也被拉回（不小于左 / 上界）', () => {
    const r = clampToBounds({ x: -500, y: -300 }, b)
    expect(r.x).toBeGreaterThanOrEqual(b.left)
    expect(r.y).toBeGreaterThanOrEqual(b.top)
  })

  it('正常位置不动（不该无故跳动）', () => {
    expect(clampToBounds({ x: 300, y: 400 }, b)).toEqual({ x: 300, y: 400 })
  })

  it('宿主小于宠物时也不会给出负坐标（退化情形）', () => {
    const tiny = boundsOf({ x: 0, y: 0, width: 50, height: 40 }, 160)
    const r = clampToBounds({ x: 100, y: 100 }, tiny)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
  })

  it('取整：像素坐标不留小数（避免 transform 上出现 0.0001px 的抖动）', () => {
    const r = clampToBounds({ x: 10.6, y: 20.4 }, { left: 0, top: 0, right: 500, bottom: 500 })
    expect(r).toEqual({ x: 11, y: 20 })
  })
})

describe('anchorOf：四角落位', () => {
  // 16:9 → size 160 时高 90
  const rect = { x: 0, y: 0, width: 1000, height: 600 }
  const o = { rect, marginX: 12, marginY: 24, size: 160 }

  it('四角各自贴对应边（含边距）', () => {
    expect(anchorOf({ ...o, corner: 'top-left' })).toEqual({ x: 12, y: 24 })
    expect(anchorOf({ ...o, corner: 'top-right' })).toEqual({ x: 1000 - 160 - 12, y: 24 })
    expect(anchorOf({ ...o, corner: 'bottom-left' })).toEqual({ x: 12, y: 600 - 90 - 24 })
    expect(anchorOf({ ...o, corner: 'bottom-right' })).toEqual({ x: 1000 - 160 - 12, y: 600 - 90 - 24 })
  })

  it('高度按 16:9 推（与素材画布一致）', () => {
    const top = anchorOf({ ...o, corner: 'top-left' })
    const bottom = anchorOf({ ...o, corner: 'bottom-left' })
    expect(bottom.y - top.y).toBe(600 - 90 - 24 - 24)
  })

  it('四个角落值都落在宿主矩形内（不会自己跑到屏外）', () => {
    const corners: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    for (const corner of corners) {
      const { x, y } = anchorOf({ ...o, corner })
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + o.size).toBeLessThanOrEqual(rect.width)
      expect(y + petHeight(o.size)).toBeLessThanOrEqual(rect.height)
    }
  })

  it('放大后仍落在矩形内（角落锚点用的也是 effectiveSize）', () => {
    const big = effectiveSize(160, 1.4)
    const p = anchorOf({ rect, corner: 'bottom-right', marginX: 12, marginY: 24, size: big })
    expect(p.x + big).toBeLessThanOrEqual(rect.width)
    expect(p.y + petHeight(big)).toBeLessThanOrEqual(rect.height)
  })
})

describe('尺寸档位（Step 5-2C E-2）：老连续值自动吸附到最近档', () => {
  it('三档定义齐备且互不相同', () => {
    expect(PET_SCALE_STEPS.map((s) => s.key)).toEqual(['small', 'standard', 'large'])
    expect(new Set(PET_SCALE_STEPS.map((s) => s.value)).size).toBe(3)
  })

  it('**历史连续值吸附到最近档**（不需要迁移写入）', () => {
    expect(nearestPetScale(0.8)).toBe(0.85) // 贴着下限的老值 → 小
    expect(nearestPetScale(1.15)).toBe(1.25) // 1.15 距 1.25 更近 → 大
    expect(nearestPetScale(1.05)).toBe(1) // 仍靠近标准
    expect(nearestPetScale(1.4)).toBe(1.25) // 贴着上限 → 大
    expect(nearestPetScale(1)).toBe(1)
  })

  it('非法输入回落标准档（不炸、不返回 NaN）', () => {
    expect(nearestPetScale(Number.NaN)).toBe(1)
    expect(nearestPetScale(undefined)).toBe(1)
    expect(nearestPetScale('x')).toBe(1)
  })

  it('petScaleKeyOf 供设置界面点亮选中项', () => {
    expect(petScaleKeyOf(0.85)).toBe('small')
    expect(petScaleKeyOf(1.15)).toBe('large')
    expect(petScaleKeyOf(Number.NaN)).toBe('standard')
  })

  it('吸附结果一定落在档位表内（渲染尺寸不会被历史值带偏）', () => {
    for (const v of [0.8, 0.9, 1.02, 1.1, 1.2, 1.39, 1.4]) {
      expect(PET_SCALE_STEPS.map((s) => s.value)).toContain(nearestPetScale(v))
    }
  })
})
