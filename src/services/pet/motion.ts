/**
 * 桌宠 · 移动规划（纯计算，无 DOM / ref，可独立单测）
 *
 * 坐标语义：移动规划归一化为**宿主矩形比例**（ratio），px 换算由运行时完成。
 *
 * ⚠️ **尺寸与边界的计算不在这里** —— 已收口到 `./geometry`
 * （`petHeight` / `boundsOf` / `clampToBounds` / `anchorOf`）。
 * 本模块只管一件事：规划一次移动 —— 从哪走到哪、会不会越界。
 *
 * 与参考项目的差异：**不移植多显示器 AABB**（`areas` / `rectAtPoint`）——
 * 浏览器里宿主就是单矩形，多屏是浏览器窗口之外的事，本项目不做。
 * 这里只保留单矩形分支，语义逐位不变。
 */
import { randomBetween } from './pickers'

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
