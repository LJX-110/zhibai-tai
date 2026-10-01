/**
 * Agent Loop —— 天机的推理循环（**纯逻辑，依赖全部注入**；Step 4-2 · C5 / Step 4-3 · 二）
 *
 * ## 循环长什么样
 * ```
 * 用户消息 ─► [LLM] ─┬─ 只读/低风险工具 ─► 执行 ─► 结果回喂 ─┐
 *                   │                                      │
 *  （不需要确认的）   └──────────────────────────────────────┘
 *                   ├─ 需要确认的工具 ─► **停下来生成 proposal**（不上屏执行）
 *                   └─ 无工具调用 ─► 最终回答（结束）
 * ```
 *
 * ## Step 4-3 · 二：确认门（这一轮补上的那一半）
 * 上一版把 `requiresConfirmation` 的工具**直接从循环里过滤掉**，于是它们永远
 * 没机会被"提议" —— 模型连提都提不了，只能靠回答里的动作 JSON。
 * 现在分两档：
 *  · `read` / `safe-write`：照旧直接执行；
 *  · `requires-confirmation`：**返回 `needs-confirmation`**，带上 `proposal`（工具 + 参数）
 *    与 `resume`（续跑凭据）。面板渲染确认卡片 → 主人点确认 → 执行 → 把结果作为
 *    `seed` 传回来继续推理。这条链是"Agent → proposal → UI → waiting → 确认 → execute
 *    → Tool Result → Agent"，**不是**让用户自己去读懂一段 JSON。
 *
 * ## 六条硬约束（规格 §C5：一个都不能少）
 *  ① **硬上限** `maxIterations`（默认 8）—— 绝不允许无限循环；
 *  ② **可中止**：`signal` 一响就退出（用户点「停止」）；
 *  ③ **工具异常不炸整轮**：把失败如实回喂（模型可换做法或如实说没查到）；
 *  ④ **未知工具不执行**：回喂"工具不存在"；
 *  ⑤ **每步都可观测**：`onEvent` 报告 thinking / tool / confirm-required / answer；
 *  ⑥ **结束原因必须明确**：`done` / `max-iterations` / `aborted` / `error` / `needs-confirmation`。
 *
 * ## 为什么把依赖全注入
 * 这样"多步、上限、中止、工具异常、确认门、续跑"全部能在单测里确定化跑出来
 * （见 `__tests__/agent-loop.test.ts`）—— 不依赖任何 store、DOM 或网络。
 */
import {
  TOOL_PROTOCOL,
  formatToolResult,
  parseToolCall,
  stripToolFences,
  toolErrorFeedback,
  unknownToolFeedback,
} from './protocol'
import { describeTools, type AgentTool, type ToolResult } from './tools'

/** 默认硬上限（规格 §C5 的例子值；可在调用处收窄） */
export const MAX_ITERATIONS = 8

/** 一轮循环里发生的事（UI 与桌宠都读它） */
export type AgentEvent =
  | { type: 'thinking'; step: number; maxSteps: number }
  | { type: 'tool'; step: number; toolId: string; toolName: string }
  | { type: 'tool-done'; step: number; toolId: string; toolName: string; count?: number }
  | { type: 'tool-error'; step: number; toolId: string; toolName: string; message: string }
  /** 碰到需要确认的工具：**没有执行**，停在提案上（UI 据此出确认卡片） */
  | { type: 'confirm-required'; step: number; toolId: string; toolName: string }
  | { type: 'answer'; step: number }

/** 结束原因 —— 界面必须能区分（规格 §C5「结束原因」） */
export type AgentEndReason =
  /** 正常给出回答 */
  | 'done'
  /** 触到硬上限（回答可能不完整，必须告诉用户） */
  | 'max-iterations'
  /** 用户中止 */
  | 'aborted'
  /** 模型调用本身失败（网络 / Key / 额度） */
  | 'error'
  /** 停在"需要主人确认"的工具上（等确认后带 seed 续跑） */
  | 'needs-confirmation'

/** 本轮实际发生的工具调用（**给下一轮会话历史用**；截断过，不含开发者格式） */
export interface AgentTraceStep {
  toolId: string
  toolName: string
  ok: boolean
  /** 一句话结果摘要（成功取结果首行，失败取错误信息） */
  summary: string
}

/** 需要确认的工具调用（面板据此渲染确认卡片） */
export interface AgentProposal {
  toolId: string
  toolName: string
  args: Record<string, unknown>
}

/**
 * 续跑凭据 —— 确认门暂停时交给面板保管，确认后原样传回。
 * 里面是"循环内部的账"（已经产生的正文与回喂条目），面板不需要理解它。
 */
export interface AgentResume {
  prose: string[]
  feedback: string[]
}

export interface AgentRunResult {
  /** 给用户看的**新增**回答（已剥工具围栏；续跑时只含续跑之后产生的部分） */
  answer: string
  /** 实际循环了几步（含最后一次回答） */
  steps: number
  reason: AgentEndReason
  /** 结束原因的可读说明（`max-iterations` / `error` 时给用户看） */
  note?: string
  /** `error` 时的原始错误信息（喂给 `health` / 故障流水） */
  errorMessage?: string
  /** 本轮真实调用过的工具（含失败；**这不等于"回答里提到过"**） */
  trace: AgentTraceStep[]
  /** `needs-confirmation` 时的提案 */
  proposal?: AgentProposal
  /** `needs-confirmation` 时的续跑凭据 */
  resume?: AgentResume
}

export interface AgentRunDeps {
  /** 调一次模型（第一轮之前的 system 由调用方组装；这里只追加"每轮的输入"） */
  complete: (
    input: string,
    onToken: (delta: string) => void,
    signal?: AbortSignal,
  ) => Promise<string>
  /** 工具（**含需确认的**：它们只被提议、不会被这里执行） */
  tools: readonly AgentTool[]
  /** 会话历史（已格式化成文本，可为空串） */
  history?: string
  /** 本轮用户问题 */
  question: string
  /** 数据上下文（插件注入的真实数据；为空则只靠工具查） */
  dataContext?: string
  /**
   * 人设与纪律（**与数据分开传**，Step 4-3 · 四）。
   * 上一版把整份人设拼进 `dataContext`，于是它落在"以下是真实数据"这行标题下面 ——
   * 人设与事实混在一个语义块里是不对的：模型会觉得"她不吃香菜"和"今天有 3 节课"
   * 是同一种东西。现在分两段，各自带标题。
   */
  personaBlock?: string
  /**
   * 额外指令（跟随工具协议之后一起进每一轮输入）。
   * 目前用于**动作协议文本** —— 它由插件规格生成（见 `describeActionProtocol`），
   * 属于"每轮都要说的规矩"，而不是数据。
   */
  extraInstructions?: string
  /** 确认后的续跑凭据（来自上一次 `needs-confirmation` 的 `resume`） */
  seed?: AgentResume
  /** 事件回调（进度、桌宠状态） */
  onEvent?: (e: AgentEvent) => void
  /** 增量文本（供界面流式显示） */
  onToken?: (delta: string) => void
  signal?: AbortSignal
  maxIterations?: number
}

/** 一条工具结果 → 给会话历史用的一句话摘要（截断，避免历史被长文本刷爆） */
function summaryOf(result: ToolResult): string {
  const first = result.text.split('\n')[0]?.trim() ?? ''
  return first.length > 60 ? `${first.slice(0, 60)}…` : first
}

/** 续跑凭据 + 一次已确认工具的执行结果 → 新的续跑凭据（格式化留在协议层） */
export function resumeWithResult(resume: AgentResume, toolId: string, result: ToolResult): AgentResume {
  return { prose: resume.prose, feedback: [...resume.feedback, formatToolResult(toolId, result)] }
}

/** 一轮的输入拼装（纯函数）：人设 + 数据 + 历史 + 工具协议 + 当前问题 + 已发生的工具结果 */
function turnInput(o: {
  personaBlock: string
  history: string
  dataContext: string
  question: string
  toolBlock: string
  extra: string
  feedback: string[]
}): string {
  const parts = [
    o.personaBlock,
    o.dataContext ? `以下是知白台用户今日的真实数据（可引用，但不要逐条复述）：\n${o.dataContext}` : '',
    o.history ? `对话历史：\n${o.history}` : '（本会话第一条提问）',
    o.toolBlock,
    o.extra,
    o.feedback.length > 0 ? `工具结果（按时间顺序，最新在最后）：\n${o.feedback.join('\n\n')}` : '',
    `用户当前问题：${o.question}`,
    '要求：中文回答，简洁有条理；引用数据时给出**具体时间 / 名称 / 金额 / 日期**，不要只报总数；' +
      '数据里没有的、也没查到的，如实说不知道，不要编造；能结合对话历史延续上下文' +
      '（主人说"它/那个"时，指的是上文中已经出现过的那件事）。',
    TOOL_PROTOCOL,
  ]
  return parts.filter(Boolean).join('\n\n')
}

/**
 * 跑一轮 Agent。
 *
 * 碰到 `requires-confirmation` 的工具时**不执行**，直接返回 `needs-confirmation`
 * 与 proposal（见文件头"确认门"）。
 */
export async function runAgent(deps: AgentRunDeps): Promise<AgentRunResult> {
  const max = Math.max(1, deps.maxIterations ?? MAX_ITERATIONS)
  const tools = deps.tools
  const toolBlock = describeTools(tools)
  /** 续跑时沿用上一次的账：正文与回喂条目都不能丢，否则模型会"忘了自己刚说过什么" */
  const baseProse = deps.seed?.prose.length ?? 0
  const feedback: string[] = [...(deps.seed?.feedback ?? [])]
  const prose: string[] = [...(deps.seed?.prose ?? [])]
  const trace: AgentTraceStep[] = []

  /** 只把**本次新增**的正文当回答返回（面板已经把前面那段显示过了） */
  const newAnswer = () => prose.slice(baseProse).join('\n\n')

  for (let step = 1; step <= max; step++) {
    if (deps.signal?.aborted) return { answer: newAnswer(), steps: step, reason: 'aborted', trace }

    deps.onEvent?.({ type: 'thinking', step, maxSteps: max })
    const input = turnInput({
      personaBlock: deps.personaBlock ?? '',
      history: deps.history ?? '',
      dataContext: deps.dataContext ?? '',
      question: deps.question,
      toolBlock,
      extra: deps.extraInstructions ?? '',
      feedback,
    })

    let text: string
    try {
      text = await deps.complete(input, (delta) => deps.onToken?.(delta), deps.signal)
    } catch (e) {
      // ⚠️ 中止与失败是两件事：用户点停止不该报"出错"（与 AI health 的既有口径一致）
      if (deps.signal?.aborted) return { answer: newAnswer(), steps: step, reason: 'aborted', trace }
      const message = e instanceof Error ? e.message : String(e)
      return {
        answer: newAnswer(),
        steps: step,
        reason: 'error',
        errorMessage: message,
        note: `模型调用失败：${message}`,
        trace,
      }
    }

    const visible = stripToolFences(text)
    if (visible) prose.push(visible)

    const call = parseToolCall(text, tools)
    if (!call) {
      // 没有工具调用 → 这一轮就是最终回答
      deps.onEvent?.({ type: 'answer', step })
      return { answer: newAnswer(), steps: step, reason: 'done', trace }
    }

    // 未知工具：如实回喂，不执行
    if (call.id.startsWith('__unknown__:')) {
      const asked = call.id.replace('__unknown__:', '')
      deps.onEvent?.({ type: 'tool-error', step, toolId: asked, toolName: asked, message: '工具不存在' })
      feedback.push(unknownToolFeedback(asked))
      continue
    }

    const tool = tools.find((t) => t.id === call.id)
    if (!tool) {
      deps.onEvent?.({ type: 'tool-error', step, toolId: call.id, toolName: call.id, message: '工具不存在' })
      feedback.push(unknownToolFeedback(call.id))
      continue
    }

    // ① 确认门：**不执行**，把提案交出去（面板出确认卡片，确认后再带 seed 续跑）
    if (tool.requiresConfirmation) {
      deps.onEvent?.({ type: 'confirm-required', step, toolId: tool.id, toolName: tool.name })
      return {
        answer: newAnswer(),
        steps: step,
        reason: 'needs-confirmation',
        trace,
        proposal: { toolId: tool.id, toolName: tool.name, args: call.args },
        resume: { prose, feedback },
      }
    }

    // ② 可直接执行（read / safe-write）
    deps.onEvent?.({ type: 'tool', step, toolId: tool.id, toolName: tool.name })
    try {
      const result = await tool.execute(call.args)
      deps.onEvent?.({ type: 'tool-done', step, toolId: tool.id, toolName: tool.name, count: result.count })
      trace.push({ toolId: tool.id, toolName: tool.name, ok: true, summary: summaryOf(result) })
      feedback.push(formatToolResult(tool.id, result))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      deps.onEvent?.({ type: 'tool-error', step, toolId: tool.id, toolName: tool.name, message })
      trace.push({ toolId: tool.id, toolName: tool.name, ok: false, summary: message })
      feedback.push(toolErrorFeedback(tool.id, message))
    }
  }

  // 走到这里 = 用满上限（每次都调了工具，从未给出回答）
  return {
    answer: newAnswer(),
    steps: max,
    reason: 'max-iterations',
    note: `已连续调用 ${max} 次工具仍未得出结论，先停在这里 —— 可以换个问法再试。`,
    trace,
  }
}
