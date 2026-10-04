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
 *
 * ## Step 4-2：松手后**不再甩抛**
 * 旧版松手会按最近位移把宠物扔出去（重力 + 反弹 + 摩擦，最终必然落到底部）。
 * 规格 §B2 要求"位置是用户设定的，桌宠不能自己改"，所以现在三种结局
 * （点击 / 系统取消 / 真拖拽）**动作完全相同：就地停下**。差别只剩一处 ——
 * 真拖拽要抑制随后浏览器补发的那次 click（`isDragSession`）。
 * `throwVelocity` / `integrate` / `resolveDragEnd` 已随重力一起移除（代码不保留）。
 */
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

/** 一次指针会话的收尾：**三种结局动作相同**（都是"就地停下"），只有是否抑制 click 不同 */
export function isDragSession(moved: boolean, cancelled: boolean): boolean {
  return moved && !cancelled
}
