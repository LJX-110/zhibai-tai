/**
 * 桌宠 · 类型模型
 *
 * 与 `public/pet/config.json` **结构同构**（唯一事实来源 = 那份 JSON），
 * 运行时不另造转换后的类型。
 *
 * 与参考项目（DSH）的差异（本轮刻意简化，不是遗漏）：
 *  · **单宠物**：不移植多实例 / `assetRoot` / `extra` / 多显示器 AABB；
 *  · **碎碎念（气泡）已做**（2026-09-23：sayings.ts + PetBubble.tsx）；
 *    **余额 / 工作状态联动不做** —— 那是把宠物做成游戏，与本项目定位不符（见文档 §〇）。
 */

/** 支持的角落 */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** 轴对齐矩形（视口语义：左上角 + 宽高） */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 移动动作：动作名 + 可选覆盖参数（未写字段取 `moves.default`） */
export interface MoveSpec {
  name: string
  params?: Record<string, number>
}

/** 移动池 */
export interface MovesConfig {
  default: Record<string, number>
  actions: MoveSpec[]
}

/** 随机动作分类（带权重；`noMirror` 的分类在朝右时不参与） */
export interface Category {
  id: string
  weight: number
  noMirror?: boolean
  actions: string[]
}

/** 事件档位槽位：单个动画名（固定播放）或候选数组（触发时档内随机抽 1） */
export type EventSlot = string | string[]

/** 事件动画：事件名 → 档位槽位数组（不进随机链，只由代码显式触发） */
export type Events = Record<string, EventSlot[]>

/** 随机链三档的权重（剩余概率归入 action） */
export interface Weights {
  idle: number
  turn: number
  move: number
}

/** 配置的 animations 段 */
export interface Animations {
  idle: string[]
  turn: string[]
  clicks: string[]
  moves: MovesConfig
  categories: Category[]
  events: Events
}

/** 拖拽抛掷物理参数 —— **P3 已实现**（见 `services/pet/physics.ts` 与 `hooks/usePetDrag.ts`） */
export interface PhysicsParams {
  gravity: number
  restitution: number
  groundFriction: number
  throwPower: number
}

/** 整份配置（= `public/pet/config.json` 的形状） */
export interface PetConfig {
  /** 单只宠物的显示名（悬浮提示用） */
  name: string
  /** 宠物显示边长（px，16:9 → 高 = size×9/16） */
  size: number
  position: { corner: Corner; marginX: number; marginY: number }
  /** 状态机节拍：每个动画播完后等待多久再掷下一轮（毫秒区间） */
  tickMs: { min: number; max: number }
  animations: Animations
  weights: Weights
  physics: PhysicsParams
}
