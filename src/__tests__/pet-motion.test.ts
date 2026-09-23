/**
 * 桌宠 · 移动几何与角落定位
 *
 * 这里最要紧的一条是**身体不越界**：`sideAllow`（左右透明边余量）让边界按"身体"贴边
 * 而不是按整个 16:9 视频盒贴边 —— 否则宠物会"漫游出屏"再也看不见，
 * 而这类问题在开发时不容易发现（要点到手滑出去才察觉）。
 */
import { describe, expect, it } from 'vitest'
import { anchorPixel, clampToViewport, planMove } from '../services/pet/motion'
import type { Corner } from '../services/pet/types'

const base = { cy: 300, W: 1000, H: 600, minDist: 100, maxDist: 100 }

describe('planMove：目标越界返回 null', () => {
  it('朝左从最左出发必越界 → null（调用方据此回退为转向）', () => {
    // margin 20 + halfW 80 - sideAllow 28 = 左界 72；cx = 0 往左必出界
    const r = planMove({ ...base, cx: 0, dir: -1, margin: 20, halfW: 80, sideAllow: 28 })
    expect(r).toBeNull()
  })

  it('朝右从最右出发必越界 → null', () => {
    const r = planMove({ ...base, cx: 1000, dir: 1, margin: 20, halfW: 80, sideAllow: 28 })
    expect(r).toBeNull()
  })

  it('居中时可移动，返回的 ratio 与像素一致', () => {
    const r = planMove({ ...base, cx: 500, dir: 1, margin: 20, halfW: 80, sideAllow: 28 })
    expect(r).not.toBeNull()
    expect(r!.startRatio).toBeCloseTo(0.5)
    expect(r!.targetRatio).toBeCloseTo(0.6) // 500 + 100 = 600
    expect(r!.totalRatio).toBeCloseTo(0.1)
  })

  it('sideAllow 放宽边界：目标落在两级边界之间时，「给透明边余量」才走得出去', () => {
    // 距离固定 100（base 的 min=max）→ cx=180 时 target = 80
    //   无余量：左界 = margin 20 + halfW 80 - 0  = 100 → 80 < 100 出界
    //   有余量：左界 = 20 + 80 - 35 = 65        → 80 ≥ 65 可走
    const tight = planMove({ cx: 180, dir: -1, ...base, margin: 20, halfW: 80 })
    const loose = planMove({ cx: 180, dir: -1, ...base, margin: 20, halfW: 80, sideAllow: 35 })
    expect(tight).toBeNull()
    expect(loose).not.toBeNull()
    expect(loose!.targetRatio).toBeCloseTo(0.08)
  })
})

describe('anchorPixel：四角坐标', () => {
  // 16:9 → size 160 时高 90
  const o = { marginX: 12, marginY: 24, size: 160, W: 1000, H: 600 }

  it('四角各自贴对应边（含边距）', () => {
    expect(anchorPixel({ ...o, corner: 'top-left' })).toEqual({ x: 12, y: 24 })
    expect(anchorPixel({ ...o, corner: 'top-right' })).toEqual({ x: 1000 - 160 - 12, y: 24 })
    expect(anchorPixel({ ...o, corner: 'bottom-left' })).toEqual({ x: 12, y: 600 - 90 - 24 })
    expect(anchorPixel({ ...o, corner: 'bottom-right' })).toEqual({ x: 1000 - 160 - 12, y: 600 - 90 - 24 })
  })

  it('高度按 16:9 推（与素材画布一致）', () => {
    const top = anchorPixel({ ...o, corner: 'top-left' })
    const bottom = anchorPixel({ ...o, corner: 'bottom-left' })
    expect(bottom.y - top.y).toBe(600 - 90 - 24 - 24)
  })

  it('四个角落值都落在视口内（不会自己跑到屏外）', () => {
    const corners: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    for (const corner of corners) {
      const { x, y } = anchorPixel({ ...o, corner })
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + o.size).toBeLessThanOrEqual(o.W)
      expect(y + (o.size * 9) / 16).toBeLessThanOrEqual(o.H)
    }
  })
})

describe('clampToViewport：视口变化后把宠物拉回屏内', () => {
  const vp = { x: 0, y: 0, width: 600, height: 800 }

  it('**窗口变窄后不再卡在屏外**（否则 planMove 两向都越界、宠物永久失踪）', () => {
    const r = clampToViewport({ x: 1200, y: 700, size: 160, viewport: vp })
    expect(r.x + 160).toBeLessThanOrEqual(vp.width)
    expect(r.y + 90).toBeLessThanOrEqual(vp.height) // 160×9/16 = 90
  })

  it('负数位置也被拉回（不小于 margin）', () => {
    const r = clampToViewport({ x: -500, y: -300, size: 160, viewport: vp })
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
  })

  it('正常位置不动（不该无故跳动）', () => {
    const r = clampToViewport({ x: 300, y: 400, size: 160, viewport: vp })
    expect(r).toEqual({ x: 300, y: 400 })
  })

  it('视口小于宠物时也不会给出负坐标（退化情形）', () => {
    const r = clampToViewport({ x: 100, y: 100, size: 160, viewport: { x: 0, y: 0, width: 50, height: 40 } })
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
  })
})
