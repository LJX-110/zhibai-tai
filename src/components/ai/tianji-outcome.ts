/**
 * 一次 Agent 运行 → 面板要的结果（**首发与确认续跑共用**）
 *
 * 此前两处各写一遍收尾：首发会解析动作、处理二次提案、报截断；
 * 续跑只追加正文 —— 于是"确认之后再提议一个动作"就静默丢了，
 * 中止也照样被当成成功。结算收成一处之后，两个入口的行为不可能再分叉。
 *
 * 这里是纯函数：不认识 React，也不写库，方便单测。
 */
import { describeAiFailure } from '../../services/ai/errors'
import type { AgentRunResult } from '../../services/agent/loop'
import { stripProtocolBlocks } from '../../services/agent/protocol-text'
import { parseTianjiActions, type TianjiActionPayload } from './action-protocol'
import { actionSpecs, agentToolById } from './plugins'
import type { ToolConfirmState } from './tool-confirm'

/** 面板渲染提案需要的最小形状（内部账不外泄） */
export interface ProposalView {
  toolName: string
  /** 工具自己给的一句话说明（不是通用文案） */
  summary: string
  state: ToolConfirmState
}

/** 结算出的完整提案：会话侧还要 toolId / args 才能执行 */
export interface ProposalDraft extends ProposalView {
  toolId: string
  args: Record<string, unknown>
}

export type TurnPhase = 'waiting' | 'success' | 'error' | 'idle'

export interface TurnOutcome {
  /** 已清洗、可直接落库的正文 */
  text: string
  actions: TianjiActionPayload[]
  proposal: ProposalDraft | null
  /** 桌宠与进度行的收尾阶段 */
  phase: TurnPhase
  errorMessage?: string
  /** 附在正文后的说明（截断 / 中止 / 失败原因的人话） */
  note?: string
  /** 是否播完成音（中止与失败不播） */
  chime: boolean
}

/** 正文 + 附注；附注本来就不含协议，不参与清洗 */
export function withNote(text: string, note?: string): string {
  return [text, note ? `（${note}）` : ''].filter(Boolean).join('\n\n')
}

export interface SettleOptions {
  /** 中止时已经流到屏幕上的文字（Agent Loop 拿不到那一轮的增量，只有节流器有） */
  partial?: string
  /** 任一轮被 max_tokens 截断 */
  truncated?: boolean
}

export function settleTurn(result: AgentRunResult, opts: SettleOptions = {}): TurnOutcome {
  // 中止时以已流出的全文为准：它包含本轮半截内容，而 result.answer 只含已完成的轮次
  const raw =
    result.reason === 'aborted' && opts.partial?.trim() ? opts.partial : result.answer
  const text = stripProtocolBlocks(raw)
  // 动作必须从**未清洗**的原文解析：清洗会把围栏一起剥掉
  const actions = parseTianjiActions(raw, actionSpecs())

  if (result.reason === 'needs-confirmation' && result.proposal) {
    const p = result.proposal
    return {
      text: text || '这一步要你点头我才动手 —— 上面就是我想做的事。',
      actions,
      proposal: {
        toolId: p.toolId,
        toolName: p.toolName,
        summary:
          agentToolById(p.toolId)?.confirmSummary?.(p.args) ?? '（这个工具没有给出说明）',
        args: p.args,
        state: 'pending',
      },
      phase: 'waiting',
      chime: true,
    }
  }

  if (result.reason === 'aborted') {
    const kept = opts.partial?.trim() ? text : ''
    return {
      text: kept,
      actions,
      proposal: null,
      phase: 'idle',
      note: kept ? '已中止' : '已中止，没有生成内容',
      chime: false,
    }
  }

  if (result.reason === 'error') {
    const reason = result.errorMessage ?? '模型调用失败'
    return {
      text,
      actions,
      proposal: null,
      phase: 'error',
      errorMessage: reason,
      note: `模型调用失败：${describeAiFailure(reason)}`,
      chime: false,
    }
  }

  // done / max-iterations
  const notes = [result.note]
  if (opts.truncated) notes.push('回答超出长度上限被截断，可让我"接着说"')
  return {
    text,
    actions,
    proposal: null,
    phase: actions.length > 0 ? 'waiting' : 'success',
    note: notes.filter(Boolean).join('；') || undefined,
    chime: true,
  }
}
