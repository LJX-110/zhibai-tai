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
 *
 * ⚠️ 漫游已降级为**可选开关**（Step 4-2）：默认关。位置由拖动决定、刷新保持；
 * 只有用户在设置里打开「漫游」时，`planMove` 才被调用（见 `usePetLoop`）。
 */
import { randomBetween } from './pickers'

/** 宠物身体相对视频盒左右各留多少像素（视频画布内身体居中、两侧透明） */
export interface MovePlan {
  startRatio: number
  targetRatio: number
  /** 位移量（活动区宽度的比例）—— 时长由它换算 */
  totalRatio: number
}

/**
 * 计算一次移动的起点/终点比例坐标；目标越出视口边缘（含边距）时返回 null。
 *
 * ⚠️ **只规划水平移动**（Step 5-3E）：y 由运行时保持当前值。此前这里还产出
 * `startYRatio`（身体中心的比例），调用方却把它当左上角用 —— 每次移动把宠物
 * 往下推半个身高，几段之后就贴底"看起来再也不动"。
 *
 * `sideAllow` = 左右透明边余量：边界按**身体**贴边而不是按整个视频盒贴边 ——
 * 宠物能走到屏幕边缘，但身体永不越界（否则会"漫游出屏"再也看不见）。
 */
export function planMove(o: {
  cx: number
  W: number
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
    targetRatio: target / o.W,
    totalRatio: Math.abs(target - o.cx) / o.W,
  }
}
