/**
 * 桌宠 · 语义状态模型（**纯函数，可单测**）
 *
 * ## 为什么需要它
 * 此前桌宠的主要行为由"idle 之后掷骰子"决定（随机链），它**看不到应用里在发生什么**：
 * 天机正在跑工具、番茄钟正在专注、用户三小时没理它 —— 桌宠表现都一样。
 * 这一层把"真实应用状态"翻译成一个**确定性**的语义状态：
 * 同样的输入必得同样的输出（没有随机、没有时间竞态），随机只保留在 `idle` 的闲暇表现里。
 *
 * ## 优先级（规格 §B4，从上到下，先命中先返回）
 * ```
 * ERROR（出错，最需要被看见）
 *   > WAITING（等主人确认 —— 这时必须叫得动人）
 *   > WORKING（工具执行中）
 *   > THINKING（模型推演中）
 *   > SUCCESS（刚做完，短暂庆祝）
 *   > FOCUSED（番茄钟 / 闭关专注中）
 *   > SLEEP（长时间无互动）
 *   > IDLE（空闲 —— 只有这时才轮到随机闲暇表现）
 * ```
 *
 * ## 两条纪律
 *  · **状态优先于表演**：人格只决定"怎么表现"，不决定"发生了什么"（见 §B6/D3）；
 *  · **本模块不认识 React / DOM / store**：只吃一个 `PetContext` 值对象，因此可纯函数单测。
 */
import type { AgentPhase } from '../agent/status'

/** 桌宠语义状态（= 它能"理解"的事；不要再为数量而增加） */
export type PetState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'success'
  | 'error'
  | 'focused'
  | 'sleep'

/** 全部语义状态（**配置校验的完整集合**：每个状态都必须有动画池，缺一个就"无动画可播"） */
export const PET_STATES: readonly PetState[] = [
  'idle',
  'thinking',
  'working',
  'waiting',
  'success',
  'error',
  'focused',
  'sleep',
]

/** 真实应用状态（由 `usePetLoop` 组装；Agent 那一项来自 `services/agent/status`） */
export interface PetContext {
  /** 天机 Agent 的当前阶段（单向数据流：Agent → 这里 → 动画） */
  agent: AgentPhase
  /** 番茄钟（或闭关）正在专注 */
  focusing: boolean
  /** 距上一次用户互动（点击 / 按键 / 触摸宠物）过去的毫秒数 */
  idleMs: number
  /** 页面是否可见（后台时不渲染，但语义上算"不在场"） */
  visible: boolean
  /** 现在（ms）—— 与状态机的时钟同源，便于确定性测试 */
  now: number
  /**
   * **庆祝窗口的截止时刻**（ms）—— 重要完成（完成待办/交作业/收工）时由完成策略点亮。
   *
   * ⚠️ 注意它**不是**新的 `PetState`：对外仍然只返回已有的 `success`，
   * 状态机也没多出枚举值。这里加的只是"输入集里的一个有时限的标记" ——
   * 时间一到自动失效，所以是**纯函数 + 可确定化单测**的（不引入定时器）。
   * 若把 `PetContext` 的字段也算作"宠物状态"，请改回方案 A（用台词近似）。
   */
  celebrateUntil?: number
}

/** 多久没互动算"睡着"（20 分钟） */
export const SLEEP_AFTER_MS = 20 * 60 * 1000

/**
 * 语义状态 ↔ Agent 阶段的映射。
 *
 * ⚠️ 只保留**真实存在**的阶段：`celebrate` 没有独立来源 —— 规格里它与 `success`
 * 是同一个意思（"成功了，高兴一下"），所以这里不新增状态；动画池里
 * `success` 就指向"雀跃庆祝"，不再让两套状态表达同一件事。
 */
const AGENT_STATE: Partial<Record<AgentPhase, PetState>> = {
  error: 'error',
  waiting: 'waiting',
  working: 'working',
  thinking: 'thinking',
  success: 'success',
}

/**
 * 由真实应用状态解析出桌宠状态（**确定性、无随机**）。
 * `idle` 是唯一的兜底 —— 其余状态都必须有明确来源。
 */
export function resolvePetState(ctx: PetContext): PetState {
  const fromAgent = AGENT_STATE[ctx.agent]
  if (fromAgent) return fromAgent
  /**
   * 庆祝窗口：压过 FOCUSED 与 SLEEP（项目既定优先级 SUCCESS > FOCUSED > SLEEP）——
   * 番茄钟到点自动收工就是"没人操作但值得庆祝"的典型场景。
   *
   * ⚠️ 但**要求 `visible`**：页面不可见时点亮庆祝等于白点（回到前台时窗口早过期，
   * 用户永远看不到这次庆祝），所以隐藏时让它照常走 sleep。
   */
  if (ctx.visible && ctx.celebrateUntil != null && ctx.now < ctx.celebrateUntil) return 'success'
  if (ctx.focusing) return 'focused'
  // 不可见 = 用户看不到它：按"睡着"处理，回前台时再唤醒（避免后台里空转播动画）
  if (!ctx.visible) return 'sleep'
  if (ctx.idleMs >= SLEEP_AFTER_MS) return 'sleep'
  return 'idle'
}

/**
 * **短暂状态**的保留时长：`success` / `error` 这类"刚刚发生"的状态，
 * 必须停留够长让用户看清 —— 否则天机一收工（Agent 立刻回 idle），
 * 桌宠的庆祝/黑脸只闪一帧，等于没发生。
 *
 * ⚠️ 不保留 `waiting`：它是"等你操作"的持续状态，一直显示才对；
 * 也不保留 `focused` / `sleep`：它们本身就是持续态的输入。
 */
export const STATE_HOLD_MS: Partial<Record<PetState, number>> = {
  success: 5000,
  error: 12000,
}

/** 该状态是否是"短暂保留"的状态 */
export function isTransient(state: PetState): boolean {
  return STATE_HOLD_MS[state] !== undefined
}

/**
 * 各语义状态的**重评估节奏**（ms）：语义动画不靠"播完一段再决策"，
 * 而是按这个节奏定期重算一次状态（动画素材自己会循环）。
 *
 * 取值依据：错误/等待/工作这些"状态位"要跟手（1.2 秒足够跟得上人的感知），
 * 空闲/睡眠这类慢节奏状态不必频繁重算。真正的**即时性**由订阅驱动 ——
 * Agent 状态或番茄钟一变，`usePetLoop` 会立刻补一次决策（`step(0)`）。
 */
export const STATE_DWELL_MS: Record<PetState, number> = {
  idle: 0, // 空闲走随机链，节奏由 config.tickMs 决定
  thinking: 1200,
  working: 1200,
  waiting: 1200,
  success: STATE_HOLD_MS.success ?? 5000,
  error: STATE_HOLD_MS.error ?? 12000,
  focused: 2400,
  sleep: 6000,
}