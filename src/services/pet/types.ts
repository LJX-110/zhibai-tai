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

/**
 * 轴对齐矩形 —— **宿主矩形**（当前宿主 = 浏览器视口）。
 * 语义是"左上角 + 宽高"。
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 桌宠**可活动边界** —— 宠物左上角的取值区间（设备无关的几何概念）。
 *
 * 与 `Rect` 的区别是刻意的：`Rect` 描述"宿主给了多大的地方"，
 * `PetBounds` 描述"宠物能在其中跑到哪儿"（已扣掉自身尺寸与边距）。
 * physics / motion / state-machine **只认后者** —— 它们不该知道窗口是什么。
 */
export interface PetBounds {
  left: number
  top: number
  right: number
  bottom: number
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

/**
 * **语义状态 → 动画池**（Step 4-2 · B5）。
 *
 * 桌宠的核心状态来自真实应用状态（`services/pet/state.ts` 的 `resolvePetState`），
 * 每个状态在这里登记一池动画（触发时池内抽一个）。**代码不写死任何动画名** ——
 * 换素材只改 `config.json`。
 */
export type StateAnims = Record<string, string[]>

/** 配置的 animations 段 */
export interface Animations {
  idle: string[]
  turn: string[]
  clicks: string[]
  moves: MovesConfig
  categories: Category[]
  events: Events
  /** 语义状态池（thinking / working / waiting / success / error / focused / sleep…） */
  states: StateAnims
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
  /**
   * **备用素材登记表**（Step 4-2 · B5）：素材目录里有、但当前没有被任何池引用的动画，
   * 逐个登记"它对应什么语义 / 为什么留着"。
   *
   * 存在的意义：这些不是死文件 —— 它们对应还没接线的状态（如"余额""碎碎念"），
   * 删掉就再也回不来（素材是离线产线出的）。登记在这里，等接上对应状态时直接引用。
   */
  reserve?: Record<string, string>
}
