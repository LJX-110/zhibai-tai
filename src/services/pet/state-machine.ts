/**
 * 桌宠 · 动作状态机（纯逻辑；时间与随机源可注入，便于单测）
 *
 * ## Step 4-2 重做：从"随机决定"改成"状态驱动"
 * 旧版把一个 idle 之后的动作**整个交给骰子**（`rollKind`），于是天机正在跑工具、
 * 番茄钟正在专注时，它照样随机摸鱼 —— 用户看到的就是"它根本不理解发生了什么"。
 * 现在分成两层：
 *
 *  ① **语义状态**（`state`）：由 `resolvePetState(ctx.context)` 从真实应用状态**确定性**推出
 *     （Agent 阶段 / 番茄钟 / 多久没互动），状态一变就播该状态的动画；
 *  ② **闲暇表现**（`phase`）：只有语义状态是 `idle` 时，才轮到随机链
 *     （待机 / 转向 / 小动作 / **可选**漫游）。随机被降级成"无事可做时的自娱自乐"。
 *
 * ## 三条纪律
 *  · **状态优先于表演**：人格与随机都不参与"发生了什么"的判定；
 *  · **短暂状态只报一次**：`success` / `error` 由 `STATE_HOLD_MS` 保留够看清，
 *    到期后**消费掉**（不会因为 Agent 还停在 success 就反复庆祝）；
 *  · **reduced-motion**：停位移与转向（只留待机与动作），因为位移/旋转是前庭不适的主要来源。
 *
 * ⚠️ 漫游（`move`）**默认关闭**：位置是用户的设定，桌宠不许自己改（规格 §B2-6）。
 */
import { planMove } from './motion'
import { pick, pickCategoryAction, rollKind } from './pickers'
import { pickStateAnim } from './animation-policy'
import {
  IDLE_SESSION_LIMIT,
  canLoadMoreIdle,
  categoriesWithin,
  idlePoolWithin,
  type IdleLoaded,
} from './idle-pool'
import { STATE_DWELL_MS, isTransient, resolvePetState, type PetContext, type PetState } from './state'
import type { PetConfig, Rect } from './types'

/** 本段在做什么：播语义状态的动画 / 待机 / 闲暇动作 / 转向 / 漫游 / 点击回应 */
export type PetPhase = 'state' | 'idle' | 'action' | 'turn' | 'move' | 'clicked'
export type Facing = 'left' | 'right'

export interface PetRuntime {
  /** 语义状态（真实世界驱动） */
  state: PetState
  phase: PetPhase
  /** 当前动画名（素材文件名，不含扩展名） */
  anim: string
  facing: Facing
  /** 本段结束时刻（ms；对短暂状态而言它就是**保留期限**） */
  until: number
  /** move 段：**只描述水平移动**（起止比例，活动矩形内）—— y 保持不变，
   *  由运行时用"当前 y"作为目标（此前的 yRatio 会把宠物一路往下推，见 decide ⑥ 注释） */
  move?: { from: number; to: number }
}

export interface DecideContext {
  now: number
  /** 注入的掷骰值 [0,1)，便于精确断言走的哪一档（只在 idle 的闲暇表现里用） */
  roll: number
  /** 当前身体中心（px，**绝对坐标**） */
  cx: number
  cy: number
  /** 宿主**可活动矩形**（px）—— 由 host 给出，本模块不读 window，见 `./geometry` */
  viewport: Rect
  /**
   * 运行时实际尺寸（**effectiveSize = baseSize × scale**）。
   * 几何口径唯一来源是 `./geometry`：状态机不再直接读 `cfg.size`，
   * 否则"用户调大宠物"之后边界仍按基准尺寸算，宠物会走出可活动区域。
   */
  size: number
  /** 是否处于 prefers-reduced-motion */
  reducedMotion: boolean
  /** 用户是否打开「漫游」（默认关：位置只由拖动决定） */
  wander: boolean
  /** 真实应用状态（Agent / 番茄钟 / 互动间隔） */
  context: PetContext
  /** 注入的随机区间取值器（默认 Math.random 版；单测可固定） */
  rand?: (min: number, max: number) => number
  /**
   * 本会话已加载过的 idle 闲暇素材（**只读视图**）。
   *
   * 缺省 `undefined` = **不限制**（旧的调用点与既有单测无需改动即可继续用）。
   * 真实运行由 `usePetLoop` 注入，上限逻辑见 `./idle-pool` ——
   * 它只约束"这次允许从哪些名字里挑"，**绝不拦 `resolveAsset`**（否则会静默定帧）。
   */
  idleLoaded?: IdleLoaded
  /** 上限值，缺省 `IDLE_SESSION_LIMIT`（20）。测试可调小，免得为验证上限造 20 轮 */
  idleLimit?: number
}

/** 各相位的标称时长（ms）。素材自带时长，但从 JS 读不到 animated WebP 的帧时长，
 *  故按经验值给"这一段大概播多久"，用于安排下一次决策。 */
const MS = {
  turn: 700,
  click: 1800,
  event: 2400,
  /** 移动速度：每秒走活动区宽度的百分之几 */
  moveSpeedRatioPerSec: 0.12,
  /** 移动的标称时长下限/上限（避免极短距离瞬间结束、极长距离等太久） */
  moveMin: 900,
  moveMax: 4200,
} as const

/**
 * 拖拽中该播什么 —— 由 `events.dragging` 配置决定；没配就返回 null（调用方维持原动画）。
 *
 * ⚠️ 为什么不给状态机加一个 `dragging` 相位：拖拽是**指针生命周期**驱动的
 * （按下 → 移动 → 松手），而状态机是**定时链**驱动的。塞进去会让两套时间源互相抢
 * （松手了相位还在、定时器又在排下一拍）。所以这里只借它的事件池取一个动画名，
 * 相位仍归 `state`/`idle` 那条链管。
 */
export function draggingAnim(cfg: PetConfig, roll = Math.random()): string | null {
  const pool = cfg.animations.events.dragging
  if (!pool || pool.length === 0) return null
  const slot = pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]
  return Array.isArray(slot) ? (slot[0] ?? null) : slot
}

/** 初始状态：待机，朝左（语义状态留给第一次 `decide` 去认 —— 它才看得到真实世界） */
export function initialRuntime(cfg: PetConfig, now: number): PetRuntime {
  return {
    state: 'idle',
    phase: 'idle',
    anim: pick(cfg.animations.idle),
    facing: 'left',
    until: now,
  }
}

/**
 * 短暂状态到期后要落到哪儿。
 *
 * `success` / `error` 是**边沿事件**：Agent 的 `success` 会一直挂到下一轮开始
 * （它不会自己变回 idle）。如果不在这里"消费掉"，桌宠每一步都会重新庆祝一次。
 * 所以保留期一到，就把 Agent 的那一项**按 idle 重算** —— 事件已经表达完了，
 * 真相仍在 AI 徽标与故障流水里。
 */
function fallbackAfterTransient(ctx: DecideContext): PetState {
  const agent = ctx.context.agent
  const downgraded = agent === 'success' || agent === 'error' ? 'idle' : agent
  return resolvePetState({ ...ctx.context, agent: downgraded })
}

/**
 * 决策下一段（在 `now >= until` 时调用，或由订阅驱动的即时重算调用）。
 * 返回的新状态一定带新的 `until`，调用方据此安排下一拍。
 */
export function decide(cfg: PetConfig, prev: PetRuntime, ctx: DecideContext): PetRuntime {
  const rand = ctx.rand ?? ((min: number, max: number) => Math.floor(min + Math.random() * (max - min)))
  const { now, viewport, size } = ctx

  // ① 短暂状态还在保留期内 → 维持（动画不换 = 素材自己循环，不会重头播）
  if (isTransient(prev.state) && now < prev.until) {
    return { ...prev, phase: 'state', until: prev.until }
  }

  // ② 语义状态（确定性；短暂状态到期时按"已消费"重算）
  const want = resolvePetState(ctx.context)
  const state: PetState = isTransient(prev.state) && want === prev.state ? fallbackAfterTransient(ctx) : want

  // ③ 状态没变、本段也还没走完 → **什么都不做**（返回原对象）。
  //    调用方据此判断"这次 tick 是白跑的"：订阅驱动的即时重算绝大多数落在这里，
  //    于是"状态没变就不打断动画"是构造出来的，而不是靠调用方自觉。
  if (state === prev.state && now < prev.until) return prev

  // ④ 状态切换 → 播该状态的动画。
  //    选动画走 `animation-policy`：**候选池由状态决定**（success 必庆祝、error 必黑脸），
  //    池内再避开"上一次播过的那个"，所以同一个状态反复进入也不会卡在同一帧。
  if (state !== prev.state) {
    return {
      state,
      phase: state === 'idle' ? 'idle' : 'state',
      anim: pickStateAnim(cfg, state, ctx.roll, prev.anim),
      facing: prev.facing,
      until: now + (STATE_DWELL_MS[state] || rand(cfg.tickMs.min, cfg.tickMs.max)),
    }
  }

  // ⑤ 非空闲状态：保持同一动画（换名会让素材从头播，看起来像"一直被打断"）
  if (state !== 'idle') {
    return { ...prev, phase: 'state', move: undefined, until: now + STATE_DWELL_MS[state] }
  }

  // ⑥ 空闲：**这时才轮到随机**（低优先级的闲暇表现）
  //    reduced-motion 下更要克制：只留待机与动作，停位移与转向
  //
  //    ⚠️ 闲暇素材的**会话上限**（Step 5-1 · E1）就落在这里：把候选池先收敛到
  //    "本次允许挑的范围"（还有额度 → 原池；到顶 → 只留已加载过的），
  //    然后照旧走随机的权重/去重逻辑。**不做拦截、不碰 resolveAsset**，
  //    所以最坏情况只是"重复播已加载过的动作"，不会出现定帧。
  const loaded = ctx.idleLoaded
  const limit = ctx.idleLimit ?? IDLE_SESSION_LIMIT
  const idlePool = idlePoolWithin(cfg.animations.idle, loaded, limit)
  // turn / move 是**小池**（1~3 个名字）：到顶后若整池都没加载过，拿 idle 池兜底 ——
  // 既不引入新下载，也不会"没有动画可播"（Step 5-3E 起 idle-pool 支持 fallback）
  const turnPool = idlePoolWithin(cfg.animations.turn, loaded, limit, idlePool)
  const movePool = idlePoolWithin(
    cfg.animations.moves.actions.map((a) => a.name),
    loaded,
    limit,
    idlePool,
  )
  const catsRaw = categoriesWithin(cfg.animations.categories, loaded, limit)
  // 分类池同理：到顶后若**整个**分类池都是未加载的名字，交给 `pickCategoryAction` 的 idle 兜底
  const cats =
    loaded && !canLoadMoreIdle(loaded, limit) && catsRaw.every((c) => c.actions.every((n) => !loaded.has(n)))
      ? []
      : catsRaw

  if (ctx.reducedMotion) {
    if (ctx.roll < 0.5) {
      return { ...prev, phase: 'idle', move: undefined, anim: pick(idlePool, prev.anim), until: now + rand(cfg.tickMs.min, cfg.tickMs.max) }
    }
    const picked = pickCategoryAction(cats, idlePool, prev.facing, prev.anim)
    return { ...prev, phase: 'action', move: undefined, anim: picked.name, until: now + MS.event }
  }

  switch (rollKind(ctx.roll, cfg.weights)) {
    case 'idle':
      return {
        ...prev,
        phase: 'idle',
        move: undefined,
        anim: pick(idlePool, prev.anim),
        until: now + rand(cfg.tickMs.min, cfg.tickMs.max),
      }

    case 'turn': {
      const facing: Facing = prev.facing === 'left' ? 'right' : 'left'
      return { ...prev, phase: 'turn', move: undefined, facing, anim: pick(turnPool, prev.anim), until: now + MS.turn }
    }

    case 'move': {
      // 漫游开关关着 → 走一次露脸的小动作（不是"什么都不做"：那会让它定住一拍）
      if (!ctx.wander) {
        const picked = pickCategoryAction(cats, idlePool, prev.facing, prev.anim)
        return { ...prev, phase: 'action', move: undefined, anim: picked.name, until: now + MS.event }
      }
      const halfW = size / 2
      // 水平安全距 = `marginX`（那是它的语义）。此前取 max(marginX, marginY) ——
      // 手机上 marginY 是 96（底边距），横向也被当成 96，可走窗口被压到几十像素，
      // 连自适应步长也放不下（Step 5-3E 一并修正）
      const margin = cfg.position.marginX
      // 比例一律在**活动矩形内**算：cx 换算成局部坐标后才能与 W 同基准
      const localCx = ctx.cx - viewport.x
      /**
       * 步长按**活动区宽度**自适应（Step 5-3E 修"开了漫游也不动"）：
       * 此前固定 `size*1.5 ~ size*5`（160px 宠物 = 240~800px 一步），
       * 在手机上活动区总宽才两三百像素 —— 目标必然越界、`planMove` 返回 null、
       * 回退成"转向"，表现就是"它从不移动"。现在上下限同时受视口约束。
       */
      const minDist = Math.max(48, Math.min(size * 0.6, viewport.width * 0.15))
      const maxDist = Math.max(minDist + 24, Math.min(size * 2.5, viewport.width * 0.4))
      for (const dir of [1, -1] as const) {
        const plan = planMove({
          cx: localCx,
          W: viewport.width,
          dir,
          minDist,
          maxDist,
          margin,
          halfW,
          // 身体两侧的透明边：按身体贴边而不是按整个视频盒贴边
          sideAllow: halfW * 0.35,
          // 随机源一并注入：否则"走多远"仍走 Math.random，单测无法确定化
          rand,
        })
        if (plan) {
          const dur = Math.min(MS.moveMax, Math.max(MS.moveMin, (plan.totalRatio / MS.moveSpeedRatioPerSec) * 1000))
          return {
            ...prev,
            phase: 'move',
            facing: dir === 1 ? 'right' : 'left',
            // 移动动画从 moves.actions 里抽（而不是固定一个），走起来才不呆板
            anim: pick(movePool, prev.anim),
            until: now + Math.round(dur),
            // move **只描述水平移动**（y 由运行时保持不变）：此前把"身体中心"比率
            // 当左上角用，每次移动都会把宠物往下推半个身高，很快就贴底不再动
            move: { from: plan.startRatio, to: plan.targetRatio },
          }
        }
      }
      // 两个方向都出界（贴边）→ 回退为转向，别停在原地
      const facing: Facing = prev.facing === 'left' ? 'right' : 'left'
      return { ...prev, phase: 'turn', move: undefined, facing, anim: pick(turnPool, prev.anim), until: now + MS.turn }
    }

    case 'action': {
      const picked = pickCategoryAction(cats, idlePool, prev.facing, prev.anim)
      return { ...prev, phase: 'action', move: undefined, anim: picked.name, until: now + MS.event }
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

/** 是否需要位移（供渲染层决定用不用位移；reduced-motion 与漫游关闭时恒为 false） */
export function isMoving(r: PetRuntime): boolean {
  return r.phase === 'move' && r.move !== undefined
}