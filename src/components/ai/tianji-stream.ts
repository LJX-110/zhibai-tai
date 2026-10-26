/**
 * 天机 · 一次流式请求的**共同外壳**
 *
 * 发问与「确认后续跑」要做的是同一件事：开节流器、挂中止器、失败时保留已流出的文字、
 * 收尾清掉挂起的刷新。此前两份 catch/finally 各写一遍，行为已经漂移过
 * （一处忘了保留 partial，中止就变成空白气泡）。
 *
 * 这里只负责"外壳"，不认识 Agent 的结算规则 —— 结果怎么落成消息由调用方给。
 */
import type { AgentRunResult } from '../../services/agent/loop'
import { stripProtocolBlocks } from '../../services/agent/protocol-text'
import { endAgentRun, finishAgentRun } from '../../services/agent/status'
import { describeAiFailure, recordAiFailure } from '../../services/ai/errors'
import type { StreamThrottle } from './stream-throttle'
import type { ChatTrace } from './chat-history'
import { withNote } from './tianji-outcome'

/** 外壳需要的宿主能力（由 hook 提供；不传 store，保持可测） */
export interface StreamTurnHost {
  isCurrentRun: (runId: number) => boolean
  /** 开一次新的节流器，并记到当前运行上 */
  openThrottle: () => StreamThrottle
  /** 记下当前中止器，供「停止」按钮使用 */
  setAbort: (ctrl: AbortController | null) => void
  appendAi: (content: string, trace?: ChatTrace[]) => void
  /** 收尾：清定时器、清流式文案、复位 busy */
  cleanup: () => void
}

export interface StreamTurnOptions {
  runId: number
  /** 故障流水里的位置（`tianji:send` / `tianji:resume`） */
  where: string
  /** 中止时的附注（续跑已经写入成功，措辞不同） */
  abortedNote: string
  request: (signal: AbortSignal, onToken: (delta: string) => void) => Promise<AgentRunResult>
  onResult: (result: AgentRunResult, partial: string) => void
  /** 失败时仍要写进该条消息的轨迹（确认续跑的回执） */
  trace?: ChatTrace[]
}

export async function streamTurn(host: StreamTurnHost, o: StreamTurnOptions): Promise<void> {
  const stream = host.openThrottle()
  const ctrl = new AbortController()
  host.setAbort(ctrl)
  try {
    const result = await o.request(ctrl.signal, stream.push)
    o.onResult(result, stream.text())
  } catch (e) {
    if (!host.isCurrentRun(o.runId)) return
    const aborted = ctrl.signal.aborted
    host.appendAi(
      withNote(
        stripProtocolBlocks(stream.text()),
        aborted ? o.abortedNote : `模型调用失败：${describeAiFailure(e)}`,
      ),
      o.trace,
    )
    if (aborted) {
      endAgentRun()
    } else {
      finishAgentRun('error', { errorMessage: e instanceof Error ? e.message : String(e) })
      recordAiFailure(o.where, e)
    }
  } finally {
    if (host.isCurrentRun(o.runId)) host.cleanup()
  }
}
