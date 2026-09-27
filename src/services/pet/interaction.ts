/**
 * 桌宠指针交互的判定规则（纯函数）
 *
 * ## 为什么必须抽出来
 * 这是本项目**出过真问题**的地方：长按的取消判据曾因两处 ref 互相清空而永久失效
 * （`PetSprite` 里先设 `startRef` 再调 `cancelLongPress()`，而后者内部会把
 * `startRef` 清成 null）—— 结果是"拖它超过 8px 也不会取消长按，500ms 后照样弹菜单"。
 * 这类顺序问题在组件里看不出来，只有变成纯函数、被单测钉住才不会复发。
 *
 * 三种行为必须严格互斥：
 *  · **点击**：按下后几乎没动就抬起 → 播点击回应
 *  · **长按**：按下后**原地**停够 500ms → 唤起菜单（移动端没有右键）
 *  · **拖拽**：按下后移动超过阈值 → 取消长按，跟手拖动
 */
import { throwVelocity } from './physics'

/** 判定"这是一次拖拽而不是点击"的位移阈值（px） */
export const DRAG_THRESHOLD = 4
/** 长按多久算"唤起菜单" */
export const LONG_PRESS_MS = 500
/** 长按期间指针移动超过这个距离就取消（那是在拖它，不是要菜单） */
export const LONG_PRESS_SLOP = 8

/** 指针位移是否已够得上"一次拖拽" */
export function exceedsDragThreshold(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) > DRAG_THRESHOLD
}

/** 长按是否该被取消（指针移开了） */
export function shouldCancelLongPress(
  from: { x: number; y: number } | null,
  to: { x: number; y: number },
): boolean {
  if (!from) return false
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) > LONG_PRESS_SLOP
}

/** 一次指针会话的收尾结果 */
export type DragEndOutcome =
  /** 没超过阈值 → 当作点击：**绝不产生甩动** */
  | { kind: 'click' }
  /** 被系统取消（来电 / 手势中断）→ 原地停下，交还状态机 */
  | { kind: 'cancel' }
  /** 真拖拽松手 → 按最近位移甩出去 */
  | { kind: 'throw'; vx: number; vy: number }

/**
 * 松手时该做什么 —— **只有真拖拽才计算并执行甩抛**。
 *
 * ⚠️ 曾经的写法是不论 `moved` 一律算速度再抛：指针抖动 1px / 16ms ≈ 62px/s，
 * 远超静止阈值（12px/s），于是**轻点一下宠物它就滑走一小段**。
 * 用户不会认为那是"惯性"，只会觉得"它自己乱动"。
 */
export function resolveDragEnd(o: {
  moved: boolean
  cancelled: boolean
  samples: readonly { t: number; x: number; y: number }[]
  now: number
  throwPower: number
}): DragEndOutcome {
  if (o.cancelled) return { kind: 'cancel' }
  if (!o.moved) return { kind: 'click' }
  const { vx, vy } = throwVelocity(o.samples, o.now, o.throwPower)
  return { kind: 'throw', vx, vy }
}
