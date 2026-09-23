/**
 * 桌宠 · 拖拽抛掷物理（**纯函数，无 DOM / 无时间源**，可独立单测）
 *
 * 四件事，对应 P3 的四条要求：
 *  · **跟手**：拖拽期间位置 1:1 跟随指针 —— 见 `usePetLoop`（这里只管松手之后）；
 *  · **甩抛**：松手时取最近若干帧的位移算速度（`throwVelocity`）；
 *  · **重力 + 碰边反弹**：`integrate` 一步积分，落地与撞墙按 `restitution` 反弹；
 *  · **地面摩擦**：贴地时水平速度按 `groundFriction` 衰减，最终停住。
 *
 * ## 三条硬约束（都不是随手定的）
 *  ① **不做逐帧 React 状态**：位置由调用方直接写 DOM transform，
 *     本模块只产出数字。60fps 改 React state 会把整棵树带上渲染路径。
 *  ② **dt 必须夹住上限**：切后台再回来时 dt 可能是好几秒，
 *     一步积分就会把宠物"甩"到视口外（而且看起来像瞬移）。
 *  ③ **静止判定要看两个轴**：只看 vy 的话，宠物会以 1px/s 无限滑行下去，
 *     甩抛循环永远结束不了（表现为"落地后还在微微动、还占着每帧的 rAF"）。
 */
import type { PhysicsParams, Rect } from './types'

export interface PhysicsState {
  x: number
  y: number
  vx: number
  vy: number
}

export interface PhysicsBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** 单步最大 dt（秒）：约 1/30 s。切后台再回来的大 dt 会被夹到这个值 */
export const MAX_STEP_SEC = 1 / 30

/** 落地后垂直速度低于它就不再弹（避免"越弹越小但永不停"） */
const REST_VY = 60
/** 水平速度低于它就算停住（配合地面摩擦一起判定） */
const REST_VX = 12
/** 贴地判定的容差（px） */
const GROUND_EPS = 0.5
/** 甩抛速度上限（px/s）—— 不夹的话"快速划过"会把宠物直接甩到屏幕外 */
const MAX_THROW_SPEED = 2600
/** 取最近多少毫秒的位移来估速度（再往前就是"拖的时候慢慢挪"，不代表松手意图） */
const VELOCITY_WINDOW_MS = 120

/** 宠物可活动范围（与 `clampToViewport` 同一套边距语义） */
export function boundsOf(size: number, viewport: Rect, margin = 8): PhysicsBounds {
  const h = (size * 9) / 16
  return {
    minX: margin,
    maxX: Math.max(margin, viewport.width - size - margin),
    minY: margin,
    maxY: Math.max(margin, viewport.height - h - margin),
  }
}

/**
 * 松手速度：取最近 `VELOCITY_WINDOW_MS` 内的位移除以时间。
 *
 * `samples` 是拖拽期间按时间顺序记下的指针位置（px + ms）。
 * 只有 1 个采样点、或时间跨度太短（同一帧）时返回 0 —— 那说明"没有甩的动作"，
 * 除以 0 会得到 Infinity，宠物会被扔出天际。
 */
export function throwVelocity(
  samples: readonly { t: number; x: number; y: number }[],
  now: number,
  throwPower = 1,
): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 }
  const last = samples[samples.length - 1]
  // 从后往前找窗口内最早的采样点
  let first = last
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break
    first = samples[i]
  }
  const dtSec = (last.t - first.t) / 1000
  if (!(dtSec > 0.001)) return { vx: 0, vy: 0 }
  const scale = Number.isFinite(throwPower) && throwPower > 0 ? throwPower : 1
  const clamp = (v: number) => Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, v * scale))
  void now // 保留参数：调用方语义上总要传"现在"，但估速只用采样点自身的时间戳
  return {
    vx: clamp((last.x - first.x) / dtSec),
    vy: clamp((last.y - first.y) / dtSec),
  }
}

/**
 * 一步积分：重力 → 位移 → 碰壁反弹 → 地面摩擦 → 静止判定。
 *
 * 返回新的状态与"是否已静止"。**静止后调用方必须停掉 rAF 循环** ——
 * 不停就是每帧空转（桌宠是常驻渲染物，这种空转正好是它最不该有的开销）。
 */
export function integrate(
  s: PhysicsState,
  dtSec: number,
  params: PhysicsParams,
  bounds: PhysicsBounds,
): { state: PhysicsState; resting: boolean } {
  const dt = Math.max(0, Math.min(Number.isFinite(dtSec) ? dtSec : 0, MAX_STEP_SEC))
  const restitution = Math.max(0, Math.min(1, params.restitution))
  const gravity = Number.isFinite(params.gravity) ? params.gravity : 0
  const friction = Math.max(0, Number.isFinite(params.groundFriction) ? params.groundFriction : 0)

  let { x, y, vx, vy } = s
  vy += gravity * dt
  x += vx * dt
  y += vy * dt

  // 左右墙
  if (x < bounds.minX) {
    x = bounds.minX
    vx = Math.abs(vx) * restitution
  } else if (x > bounds.maxX) {
    x = bounds.maxX
    vx = -Math.abs(vx) * restitution
  }
  // 天花板
  if (y < bounds.minY) {
    y = bounds.minY
    vy = Math.abs(vy) * restitution
  }
  // 地面
  if (y > bounds.maxY) {
    y = bounds.maxY
    vy = -Math.abs(vy) * restitution
  }
  const onGround = y >= bounds.maxY - GROUND_EPS
  if (onGround) {
    // 贴地才摩擦：腾空时没有地面可摩擦，减速会显得"空气有黏性"
    vx *= Math.max(0, 1 - friction * dt)
    if (Math.abs(vy) < REST_VY) vy = 0
  }

  const resting = onGround && Math.abs(vy) < REST_VY && Math.abs(vx) < REST_VX
  // 静止就**精确贴地**：onGround 有 0.5px 容差，不补齐的话宠物会永远停在离地面
  // 0.2px 的地方，下一次抛掷也从那个"悬空"位置起算 —— 一次差一点，几次之后看得出来
  if (resting) y = bounds.maxY
  return { state: { x, y, vx, vy }, resting }
}
