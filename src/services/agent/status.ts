/**
 * Agent 状态 —— 天机"此刻在做什么"的**唯一可订阅真相**（Step 4-2 · D1）
 *
 * ## 单向数据流（谁也别回写谁）
 * ```
 * Agent Runtime ──► AgentStatus ──► PetContext ──► PetState ──► 桌宠动画 + 台词
 *                              └──► 天机面板的进度显示
 * ```
 * 桌宠**只订阅**、不回写；面板同样只读。这样"桌宠看到的是真实世界"是构造出来的，
 * 而不是靠两边各自猜。
 *
 * ## 三条约定
 *  · **只放内存**：streaming / loading / 当前步骤这类瞬时状态**绝不落库、绝不同步**
 *    （它们每几百毫秒就变，进快照会把同步链路的脏标记刷爆，且换设备毫无意义）；
 *  · **浅比较后再通知**：与 `services/ai/health.ts` 同一套路 —— 状态没实质变化不触发重渲染；
 *  · **失败必须带原因**：`error` 阶段一定要有 `errorMessage`，否则界面上只说"出错"，
 *    用户无从判断该改 Key、查额度还是重试。
 *
 * （模块内刻意不放任何 UI 文案：阶段怎么"说"由天机面板与桌宠各自决定，
 *   本模块只提供事实 —— 只有一处知道"现在在做什么"。）
 */

/** Agent 的执行阶段（与规格 §D1 一致；`idle` 之外都表示"在做事"） */
export type AgentPhase = 'idle' | 'thinking' | 'working' | 'waiting' | 'success' | 'error'

export interface AgentStatus {
  phase: AgentPhase
  /** 正在执行的工具 id（`working` 时） */
  currentTool?: string
  /** 一句话说明当前在做什么（面板进度行用） */
  currentTask?: string
  /** 已完成的工具调用步数（含当前这一步） */
  step?: number
  /** 硬上限（与 Agent Loop 的 MAX_ITERATIONS 同源） */
  maxSteps?: number
  /** 本轮开始 / 结束时刻（ms） */
  startedAt?: number
  finishedAt?: number
  /** 失败原因（`error` 时必有） */
  errorMessage?: string
}

const IDLE: AgentStatus = { phase: 'idle' }

let status: AgentStatus = IDLE
const listeners = new Set<() => void>()

/** 只在字段真的变化时才换引用并通知 —— 否则每次 set 都触发一轮渲染 */
function commit(next: AgentStatus): void {
  const same =
    next.phase === status.phase &&
    next.currentTool === status.currentTool &&
    next.currentTask === status.currentTask &&
    next.step === status.step &&
    next.maxSteps === status.maxSteps &&
    next.startedAt === status.startedAt &&
    next.finishedAt === status.finishedAt &&
    next.errorMessage === status.errorMessage
  if (same) return
  status = next
  for (const fn of listeners) fn()
}

export function getAgentStatus(): AgentStatus {
  return status
}

export function subscribeAgentStatus(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 合并式更新：只改传入的字段（`undefined` 表示"不改这一项"） */
export function setAgentStatus(patch: Partial<AgentStatus>): void {
  const next: AgentStatus = { ...status }
  for (const [k, v] of Object.entries(patch) as [keyof AgentStatus, never][]) {
    if (v !== undefined) next[k] = v
  }
  commit(next)
}

/** 开始一轮（清掉上一轮的结束信息与错误） */
export function beginAgentRun(task?: string): void {
  commit({ phase: 'thinking', startedAt: Date.now(), step: 1, currentTask: task })
}

/** 回到空闲（收工 / 用户关闭面板 / 主动停止） */
export function endAgentRun(): void {
  commit({ phase: 'idle', finishedAt: Date.now() })
}

/**
 * **收工带结果**（成功 / 出错）—— 结束时刻在**这里**取，调用方不必自己写 `Date.now()`。
 *
 * 为什么要有这个函数：`Date.now()` 是"不纯调用"，写在组件 / hook 体内会被
 * React Compiler 的 purity 规则拦下（本项目 oxlint 为 0 warning 的硬基线）。
 * 把"取时间"收进服务层，组件侧只表达**发生了什么**，两个目的同时达成。
 */
export function finishAgentRun(phase: 'success' | 'error', patch: Partial<AgentStatus> = {}): void {
  setAgentStatus({ ...patch, phase, finishedAt: Date.now() })
}

/** 供测试重置模块级状态（**不清订阅者** —— 清掉会让已挂载的订阅静默失效） */
export function __resetAgentStatusForTest(): void {
  status = IDLE
}

/**
 * 阶段 → 一句人话（**只有一处**知道"阶段该怎么说"）。
 * 天机面板的进度行与桌宠的气泡都从这里取词，避免两边各写一份、渐渐说的不一样。
 */
export const AGENT_PHASE_LABEL: Record<AgentPhase, string> = {
  idle: '待命',
  thinking: '推演中',
  working: '执行中',
  waiting: '等待确认',
  success: '已完成',
  error: '出错',
}