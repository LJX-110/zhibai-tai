/**
 * 桌宠 · 动作状态机（纯逻辑；时间与随机源可注入，便于单测）
 *
 * 六种相位：`idle` 待机 / `action` 随机动作 / `turn` 转向 / `move` 漫游 / `clicked` 点击回应 / `busy` 外部占用。
 *
 * 设计要点：
 *  1. **配置驱动**：动画池、权重、周期全部来自 `config.json`，本文件不写死任何动画名；
 *  2. **时间与随机可注入**：`decide()` 只吃 `{ now, roll }`，因此"掷到哪一档"能精确断言；
 *  3. **不漏任何一次决策**：`decide` 返回的段一定带 `until`（结束时刻），
 *     循环靠它调度下一拍 —— 没有"忘了安排下一拍导致宠物定住"的可能；
 *  4. **reduced-motion**：减速偏好下**停位移与转向**（只留待机与动作），
 *     因为位移/旋转是前庭不适的主要来源；动作只做透明度切换，安全。
 *
 * ⚠️ 移动失败（目标越界）**回退为转向**而不是停在原地 —— 否则宠物会卡在屏幕边缘不动。
 */
import { planMove } from './motion'
import { pick, pickCategoryAction, rollKind } from './pickers'
import type { PetConfig, Rect } from './types'

export type PetPhase = 'idle' | 'action' | 'turn' | 'move' | 'clicked' | 'busy'
export type Facing = 'left' | 'right'

export interface PetRuntime {
  phase: PetPhase
  /** 当前动画名（素材文件名，不含扩展名） */
  anim: string
  facing: Facing
  /** 本段结束时刻（ms，与注入的 now 同源） */
  until: number
  /** move 段：起止比例与起始高度比例（CSS 靠 transform 过渡） */
  move?: { from: number; to: number; yRatio: number }
  /** 外部占用（天机忙闲）；true 时强制 busy，外部释放才恢复随机链 */
  externalBusy: boolean
}

export interface DecideContext {
  now: number
  /** 注入的掷骰值 [0,1)，便于精确断言走的哪一档 */
  roll: number
  /** 当前身体中心（px） */
  cx: number
  cy: number
  /** 视口（px） */
  viewport: Rect
  /** 是否处于 prefers-reduced-motion */
  reducedMotion: boolean
  /** 注入的随机区间取值器（默认 Math.random 版；单测可固定） */
  rand?: (min: number, max: number) => number
}

/** 各相位的标称时长（ms）。素材自带时长，但从 JS 读不到 animated WebP 的帧时长，
 *  故按经验值给"这一段大概播多久"，用于安排下一次决策。 */
const MS = {
  turn: 700,
  click: 1800,
  event: 2400,
  /** 移动速度：每秒走视口宽度的百分之几 */
  moveSpeedRatioPerSec: 0.12,
  /** 移动的标称时长下限/上限（避免极短距离瞬间结束、极长距离等太久） */
  moveMin: 900,
  moveMax: 4200,
} as const

/** 取某个事件池的第一个槽位动画（事件是显式触发的，不参与随机权重） */
function eventAnim(cfg: PetConfig, name: string): string | null {
  const pool = cfg.animations.events[name]
  if (!pool || pool.length === 0) return null
  const first = pool[0]
  return typeof first === 'string' ? first : first[0]
}

/**
 * 拖拽中该播什么 —— 由 `events.dragging` 配置决定；没配就返回 null（调用方维持原动画）。
 *
 * ⚠️ 为什么不给状态机加一个 `dragging` 相位：拖拽是**指针生命周期**驱动的
 * （按下 → 移动 → 松手），而状态机是**定时链**驱动的。塞进去会让两套时间源互相抢
 * （松手了相位还在、定时器又在排下一拍）。所以这里只借它的事件池取一个动画名，
 * 相位仍归 idle/action 那条链管。
 */
export function draggingAnim(cfg: PetConfig, roll = Math.random()): string | null {
  const pool = cfg.animations.events.dragging
  if (!pool || pool.length === 0) return null
  const slot = pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]
  return Array.isArray(slot) ? (slot[0] ?? null) : slot
}

/** 初始状态：待机，朝左 */
export function initialRuntime(cfg: PetConfig, now: number): PetRuntime {
  return {
    phase: 'idle',
    anim: pick(cfg.animations.idle),
    facing: 'left',
    until: now,
    externalBusy: false,
  }
}

/**
 * 决策下一段（在 `now >= until` 时调用）。
 * 返回的新状态一定带新的 `until`，调用方据此安排下一拍。
 */
export function decide(cfg: PetConfig, prev: PetRuntime, ctx: DecideContext): PetRuntime {
  const rand = ctx.rand ?? ((min: number, max: number) => Math.floor(min + Math.random() * (max - min)))
  const { now, viewport } = ctx

  // ① 外部占用优先：进 busy 段（没有 busy 动画则退回 idle，但相位仍记 busy 以便外部释放时能识别）
  if (prev.externalBusy) {
    return { ...prev, phase: 'busy', anim: eventAnim(cfg, 'busy') ?? prev.anim, until: now + MS.event }
  }
  // 外部刚从忙转闲：让出相位，走一次正常随机链
  if (prev.phase === 'busy') {
    return { ...prev, phase: 'idle', anim: pick(cfg.animations.idle), until: now + rand(cfg.tickMs.min, cfg.tickMs.max) }
  }

  // ② reduced-motion：只留待机与动作（停位移、停转向）
  if (ctx.reducedMotion) {
    if (ctx.roll < 0.5) {
      return { ...prev, phase: 'idle', anim: pick(cfg.animations.idle, prev.anim), until: now + rand(cfg.tickMs.min, cfg.tickMs.max) }
    }
    const picked = pickCategoryAction(cfg.animations.categories, cfg.animations.idle, prev.facing, prev.anim)
    return { ...prev, phase: 'action', anim: picked.name, until: now + MS.event }
  }

  // ③ 正常随机链
  switch (rollKind(ctx.roll, cfg.weights)) {
    case 'idle':
      return {
        ...prev,
        phase: 'idle',
        anim: pick(cfg.animations.idle, prev.anim),
        until: now + rand(cfg.tickMs.min, cfg.tickMs.max),
      }

    case 'turn': {
      const facing: Facing = prev.facing === 'left' ? 'right' : 'left'
      return { ...prev, phase: 'turn', facing, anim: pick(cfg.animations.turn, prev.anim), until: now + MS.turn }
    }

    case 'move': {
      const halfW = cfg.size / 2
      const margin = Math.max(cfg.position.marginX, cfg.position.marginY)
      for (const dir of [1, -1] as const) {
        const plan = planMove({
          cx: ctx.cx,
          cy: ctx.cy,
          W: viewport.width,
          H: viewport.height,
          dir,
          minDist: cfg.size * 1.5,
          maxDist: cfg.size * 5,
          margin,
          halfW,
          // 身体两侧的透明边：按身体贴边而不是按整个视频盒贴边
          sideAllow: halfW * 0.35,
          // 随机源一并注入：否则"走多远"仍走 Math.random，单测无法确定化
          rand,
        })
        if (plan) {
          const distRatio = Math.abs(plan.targetRatio - plan.startRatio)
          const dur = Math.min(MS.moveMax, Math.max(MS.moveMin, (distRatio / MS.moveSpeedRatioPerSec) * 1000))
          return {
            ...prev,
            phase: 'move',
            facing: dir === 1 ? 'right' : 'left',
            // 移动动画从 moves.actions 里抽（而不是固定一个），走起来才不呆板
            anim: pick(
              cfg.animations.moves.actions.map((a) => a.name),
              prev.anim,
            ),
            until: now + Math.round(dur),
            move: { from: plan.startRatio, to: plan.targetRatio, yRatio: plan.startYRatio },
          }
        }
      }
      // 两个方向都出界（贴边）→ 回退为转向，别停在原地
      const facing: Facing = prev.facing === 'left' ? 'right' : 'left'
      return { ...prev, phase: 'turn', facing, anim: pick(cfg.animations.turn, prev.anim), until: now + MS.turn }
    }

    case 'action': {
      const picked = pickCategoryAction(cfg.animations.categories, cfg.animations.idle, prev.facing, prev.anim)
      return { ...prev, phase: 'action', anim: picked.name, until: now + MS.event }
    }
  }
}

/** 点击回应：抢断当前段，播一段 clicks（连点会重新计时） */
export function onPetClick(cfg: PetConfig, prev: PetRuntime, now: number, roll = 0): PetRuntime {
  const pool = cfg.animations.clicks
  if (pool.length === 0) return prev
  const idx = Math.min(pool.length - 1, Math.floor(roll * pool.length))
  return { ...prev, phase: 'clicked', anim: pool[idx], until: now + MS.click, move: undefined }
}

/** 外部忙闲注入口 —— **天机联动仍是预留**（P4 的另一半「气泡/碎碎念」已做，
    这一半要先让 busy 变成可订阅状态，见 `docs/方案与实现.md` §3.7） */
export function setExternalBusy(prev: PetRuntime, busy: boolean): PetRuntime {
  if (prev.externalBusy === busy) return prev
  return { ...prev, externalBusy: busy }
}

/** 是否需要位移（供渲染层决定用不用 transform 过渡；reduced-motion 下恒为 false） */
export function isMoving(r: PetRuntime): boolean {
  return r.phase === 'move' && r.move !== undefined
}
