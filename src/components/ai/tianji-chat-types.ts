/**
 * 天机会话的**对外形状**（hook 的 API 契约）
 *
 * 与实现分文件的原因只有一个：`use-tianji-chat.ts` 要守住单文件 400 行的硬线。
 * 这里只放类型，不放逻辑 —— 面板只依赖本文件，改内部编排不会牵动它。
 */
import type { useTodayStats } from '../../hooks/useTodayStats'
import type { AgentResume } from '../../services/agent/loop'
import type { ChatMessage } from './chat-history'
import type { TianjiActionPayload } from './action-protocol'
import type { TianjiCapabilityKey } from './tianji-capability'
import type { ProposalView } from './tianji-outcome'
import type { ToolConfirmState } from './tool-confirm'

/** 一个等着用户裁决的工具提案（只可能是 `requires-confirmation` 的工具） */
export interface ProposalState {
  toolId: string
  toolName: string
  /** 工具自己给的一句话说明（不是通用文案） */
  summary: string
  args: Record<string, unknown>
  /** 续跑凭据：确认后带着它回到循环 */
  resume: AgentResume
  /** 原始问题与会话快照（续跑要用同一份上下文） */
  question: string
  history: ChatMessage[]
  state: ToolConfirmState
  /** 提案落在哪条 AI 消息上：忽略 / 失败时把轨迹写回那条，不靠"最后一条"猜 */
  messageId?: string
}

export interface TurnContext {
  question: string
  history: ChatMessage[]
  /** 已经发生、但还没落进任何 AI 消息的工具步（确认续跑的回执） */
  priorTrace?: ChatMessage['trace']
}

export interface TianjiChat {
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  busy: boolean
  streamText: string
  /** 每条 AI 消息提议的动作（**按消息 id 索引**；下标会在插入/续跑时错位） */
  pendingActions: Record<string, TianjiActionPayload[]>
  resolved: Record<string, 'done' | 'skip'>
  /** 正在落库的卡片（`messageId-j`）—— 用于禁用按钮，挡住双击 */
  settling: Record<string, true>
  proposal: ProposalView | null
  stats: ReturnType<typeof useTodayStats>
  send: (text?: string) => void
  /** 重试上一问（失败 / 中止后的出口；把最后一条用户消息再发一次） */
  retry: () => void
  stop: () => void
  newChat: () => void
  confirmAction: (messageId: string, j: number, a: TianjiActionPayload) => void
  skipAction: (messageId: string, j: number, a: TianjiActionPayload) => void
  confirmProposal: () => void
  cancelProposal: () => void
  runCap: (key: TianjiCapabilityKey) => void
}
