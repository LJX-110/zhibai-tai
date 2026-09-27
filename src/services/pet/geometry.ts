/**
 * 桌宠几何 —— **尺寸与边界的唯一入口**
 *
 * ## 为什么单独成文件
 * 此前"宠物多大"有**两个真相**：`public/pet/config.json` 的 `size`（几何计算用）
 * 与 `PetStage.tsx` 里的 `const VIEW_SIZE = 160`（渲染用），靠一句注释人工对齐。
 * 一旦只改一处，渲染尺寸（Sprite / Bubble / Menu）与边界计算（motion / physics / drag）
 * 立刻不一致 —— 表现是"拖到边缘时越界或贴不到边"，而且**不报错**。
 *
 * ## 三个概念（只有这三个）
 *  · `baseSize`      = `config.json` 的 `size`（素材基准尺寸）
 *  · `scale`         = 用户设备偏好 `settings.petScale`（0.8 ~ 1.4）
 *  · `effectiveSize` = `baseSize × scale` —— **运行时唯一实际尺寸**
 *
 * ## 16:9 换算也只在这里写一次
 * 素材是 16:9 画布、身体居中。此前 `motion.clampToViewport` / `motion.anchorPixel` /
 * `physics.boundsOf` 各自写了一遍 `(size * 9) / 16`。任何一处写错都不会报错，
 * 只会让"能走到哪"与"看起来多大"对不上。
 */
import type { Corner, PetBounds, Rect } from './types'

/** 素材画布的高/宽比（16:9 → 0.5625） */
export const PET_ASPECT_H = 9 / 16

/** 用户可调尺寸的上下限（比 1 小太多会看不清动作，太大挡内容） */
export const PET_SCALE_MIN = 0.8
export const PET_SCALE_MAX = 1.4
/** 默认尺寸倍率（设置项缺省值；`config.json` 的 size 是 160，即默认实际 160px） */
export const DEFAULT_PET_SCALE = 1

/** 默认活动边距（与 `clampToBounds` 同一套语义） */
export const PET_MARGIN = 8

/** 宠物显示高度（由宽度推；素材是 16:9 画布） */
export function petHeight(width: number): number {
  return width * PET_ASPECT_H
}

/** 把任意来源的 scale 收敛到合法区间；非有限值退回默认值（1） */
export function clampPetScale(scale: unknown): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return DEFAULT_PET_SCALE
  return Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, scale))
}

/** 运行时唯一实际尺寸 = baseSize × scale */
export function effectiveSize(baseSize: number, scale: number): number {
  return baseSize * clampPetScale(scale)
}

/**
 * 宿主矩形 → 桌宠可活动边界（宠物**左上角**的取值区间）。
 *
 * 边界按**宠物整体**（含 16:9 画布）贴边，所以无论如何都跑不出宿主矩形。
 * 宿主矩形由 `PetHost.getViewport()` 提供（本项目只有浏览器宿主 = 视口），
 * 本模块不认识"窗口"是什么东西。
 */
export function boundsOf(rect: Rect, size: number, margin = PET_MARGIN): PetBounds {
  const h = petHeight(size)
  return {
    left: margin,
    top: margin,
    right: Math.max(margin, rect.width - size - margin),
    bottom: Math.max(margin, rect.height - h - margin),
  }
}

/**
 * 把一点**夹回边界内**。
 *
 * 为什么必须有：窗口变窄 / 手机旋屏后，宠物可能停在边界之外；而此时 `planMove`
 * 的两个方向都会判越界 → 回退成"转向"（不产生位移）—— 结果是**宠物永久卡在屏外**，
 * 界面上还显示"桌宠已开启"。所以宿主尺寸一变就要把它拉回来。
 */
export function clampToBounds(p: { x: number; y: number }, b: PetBounds): { x: number; y: number } {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), Math.max(lo, hi))
  return {
    x: Math.round(clamp(p.x, b.left, b.right)),
    y: Math.round(clamp(p.y, b.top, b.bottom)),
  }
}

/**
 * 角落 + 边距 → 宠物左上角像素坐标（与 CSS 角落语义一致）。
 * 用于"从未有过位置记录"时的首次落位。
 */
export function anchorOf(o: {
  rect: Rect
  corner: Corner
  marginX: number
  marginY: number
  size: number
}): { x: number; y: number } {
  const height = petHeight(o.size)
  const left = o.marginX
  const top = o.marginY
  const right = Math.max(left, o.rect.width - o.size - o.marginX)
  const bottom = Math.max(top, o.rect.height - height - o.marginY)
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
