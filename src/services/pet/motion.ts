/**
 * 桌宠 · 移动几何与角落定位（纯计算，无 DOM / ref，可独立单测）
 *
 * 坐标语义：移动规划归一化为**视口比例**（ratio），px 换算由 rAF 驱动完成；
 * 角落定位返回宠物根节点左上角的**像素**坐标。
 *
 * 与参考项目的差异：**不移植多显示器 AABB**（`areas` / `rectAtPoint`）——
 * 浏览器里视口就是单矩形，多屏逻辑属于 P7 桌面壳。这里只保留单矩形分支，语义逐位不变。
 */
import { randomBetween } from './pickers'
import type { Corner, Rect } from './types'

/** 宠物身体相对视频盒左右各留多少像素（视频画布内身体居中、两侧透明） */
export interface MovePlan {
  startRatio: number
  startYRatio: number
  targetRatio: number
  totalRatio: number
}

/**
 * 计算一次移动的起点/终点比例坐标；目标越出视口边缘（含边距）时返回 null。
 *
 * `sideAllow` = 左右透明边余量：边界按**身体**贴边而不是按整个视频盒贴边 ——
 * 宠物能走到屏幕边缘，但身体永不越界（否则会"漫游出屏"再也看不见）。
 */
export function planMove(o: {
  cx: number
  cy: number
  W: number
  H: number
  dir: 1 | -1
  minDist: number
  maxDist: number
  margin: number
  halfW: number
  sideAllow?: number
  /** 随机源（可注入以便单测确定化；默认 uniform [min,max)） */
  rand?: (min: number, max: number) => number
}): MovePlan | null {
  const side = o.sideAllow ?? 0
  const distance = (o.rand ?? randomBetween)(o.minDist, o.maxDist)
  const target = o.cx + o.dir * distance
  // margin 语义 =「身体到屏幕边缘的安全距」
  const leftBound = o.margin + o.halfW - side
  const rightBound = o.W - o.margin - o.halfW + side
  if (target < leftBound || target > rightBound) return null
  return {
    startRatio: o.cx / o.W,
    startYRatio: o.cy / o.H,
    targetRatio: target / o.W,
    totalRatio: Math.abs(target - o.cx) / o.W,
  }
}

/**
 * 角落 + 边距 → 宠物根节点左上角像素坐标（与 CSS 角落语义一致）。
 * 高度按 16:9 推（素材是 16:9 画布，宠物身体居中）。
 */
export function anchorPixel(o: {
  corner: Corner
  marginX: number
  marginY: number
  size: number
  W: number
  H: number
}): { x: number; y: number } {
  const height = (o.size * 9) / 16
  const left = o.marginX
  const top = o.marginY
  const right = o.W - o.size - o.marginX
  const bottom = o.H - height - o.marginY
  switch (o.corner) {
    case 'top-left':
      return { x: left, y: top }
    case 'top-right':
      return { x: right, y: top }
    case 'bottom-left':
      return { x: left, y: bottom }
    case 'bottom-right':
      return { x: right, y: bottom }
  }
}

/**
 * 把宠物位置**夹回视口内**。
 *
 * 为什么必须有：窗口变窄 / 手机旋屏后，宠物可能停在视口之外；而此时 `planMove`
 * 的两个方向都会判越界 → 回退成"转向"（不产生位移）—— 结果是**宠物永久卡在屏幕外**，
 * 界面上还显示"桌宠已开启"。所以视口一变就要把它拉回来。
 *
 * 纯函数，不碰 DOM，便于单测。
 */
export function clampToViewport(o: {
  x: number
  y: number
  size: number
  viewport: Rect
  margin?: number
}): { x: number; y: number } {
  const margin = o.margin ?? 8
  const h = (o.size * 9) / 16
  const maxX = Math.max(0, o.viewport.width - o.size - margin)
  const maxY = Math.max(0, o.viewport.height - h - margin)
  const clamp = (v: number, max: number) => Math.min(Math.max(v, margin), Math.max(margin, max))
  return { x: Math.round(clamp(o.x, maxX)), y: Math.round(clamp(o.y, maxY)) }
}
