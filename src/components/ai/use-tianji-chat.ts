/**
 * 天机 · 会话编排（**组件之外的那一半**）
 *
 * 面板只负责取状态并画出来；发问 / 续跑 / 落库 / 换新这四条流程在这里 ——
 * 它们与渲染无关，而面板曾因两者混在一起顶到 483 行（单文件上限 400）。
 *
 * 四条纪律：
 *  · 流式增量**收齐后**才解析动作；气泡与历史共用同一份清洗（protocol-text）；
 *  · **中止 ≠ 出错**：保留已流出的文字，不播完成音，也不让桌宠黑脸；
 *  · 首发与确认续跑走同一个结算函数 —— 否则"二次提案 / 截断 / 动作解析"必有一边漏；
 *  · `busy` 必须有一份同步 ref：state 更新前双击，守卫读到还是 false。
 */
import { useEffect, useRef, useState } from 'react'
import { useTodayStats } from '../../hooks/useTodayStats'
import { createId } from '../../utils/id'
import { playSound } from '../../services/sound'
import { beginAgentRun, endAgentRun, finishAgentRun, setAgentStatus } from '../../services/agent/status'
import { resumeWithResult, type AgentRunResult } from '../../services/agent/loop'
import { describeAiFailure, recordAiFailure } from '../../services/ai/errors'
import { stripProtocolBlocks } from '../../services/agent/protocol-text'
import { withStreamSink } from '../../services/ai/stream-sink'
import { createStreamThrottle, type StreamThrottle } from './stream-throttle'
import { useToastStore } from '../ui/toast-store'
import { agentToolById } from './plugins'
import { loadHistory, saveHistory, type ChatMessage, type ChatTrace } from './chat-history'
import { runTianjiAgent } from './agent-run'
import { TIANJI_CAPABILITIES, runTianjiCapability, type TianjiCapabilityKey } from './tianji-capability'
import { useTianjiActions } from './use-tianji-actions'
import { settleTurn, withNote } from './tianji-outcome'
import { streamTurn } from './tianji-stream'
import type { ProposalState, TianjiChat, TurnContext } from './tianji-chat-types'
import type { TianjiActionPayload } from './action-protocol'

/** 流式增量的节流间隔：长回答逐 token setState 会触发数百次渲染 */
const FLUSH_MS = 60

export function useTianjiChat(): TianjiChat {
  // 天机 = 内置小 agent：打开即恢复上次会话（本地存档），不再每次清空
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [streamText, setStreamText] = useState('')
  const [pendingActions, setPendingActions] = useState<Record<string, TianjiActionPayload[]>>({})
  /** 待裁决的工具提案：同时最多一个 —— 一次只让用户决定一件事 */
  const [proposal, setProposal] = useState<ProposalState | null>(null)
  /** 动作提议的裁决状态与对应动作，独立成 hook；结果写回消息轨迹 */
  const { resolved, running, resetResolved, confirmAction, skipAction } = useTianjiActions({
    onTrace: (messageId, step) =>
      setMessages((m) =>
        m.map((msg) =>
          msg.id === messageId ? { ...msg, trace: [...(msg.trace ?? []), step] } : msg,
        ),
      ),
  })
  const abortRef = useRef<AbortController | null>(null)
  /**
   * 会话代次。开新一轮 / 清空会话时 +1；上一轮的异步收尾据此静默退出。
   * 没有它的话，「新对话」之后在途请求返回的正文、busy、proposal 会写进新会话。
   */
  const runIdRef = useRef(0)
  const beginRun = () => ++runIdRef.current
  const isCurrentRun = (id: number) => id === runIdRef.current
  /** 当前这一轮的流式节流器（一次运行一个；收尾时清掉挂起的刷新） */
  const flushRef = useRef<StreamThrottle | null>(null)
  const stats = useTodayStats()

  // 会话一有变化就落本地存档（localStorage，刻意不进业务表 / 不同步）
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  /** 追加一条天机回答（返回 id：动作 / 提案都按 id 归属，不再用数组下标） */
  const appendAi = (content: string, trace: ChatTrace[] = []): string => {
    const id = createId()
    setMessages((m) => [
      ...m,
      { id, role: 'ai', content, ...(trace.length > 0 ? { trace } : {}) },
    ])
    return id
  }

  /** 开一次新的流式节流器（**每次运行一个**，避免两轮串味） */
  const throttled = () => {
    const s = createStreamThrottle(setStreamText, FLUSH_MS)
    flushRef.current = s
    return s
  }
  const clearFlush = () => {
    flushRef.current?.clear()
    flushRef.current = null
  }

  /** 一次运行收尾（成功 / 失败 / 中止共用）：清定时器、清流式文案、复位 busy */
  const cleanup = () => {
    clearFlush()
    abortRef.current = null
    setStreamText('')
    setBusy(false)
    busyRef.current = false
  }

  const streamHost = {
    isCurrentRun,
    openThrottle: throttled,
    setAbort: (ctrl: AbortController | null) => {
      abortRef.current = ctrl
    },
    appendAi,
    cleanup,
  }

  /** 收尾：结果 → 消息 + 动作卡片 + 提案 + 桌宠状态（首发与续跑共用） */
  const finishTurn = (runId: number, result: AgentRunResult, ctx: TurnContext, partial: string) => {
    if (!isCurrentRun(runId)) return
    const out = settleTurn(result, { partial, truncated: result.truncated })
    const content = withNote(out.text, out.note)
    const trace = [...(ctx.priorTrace ?? []), ...result.trace]
    let messageId: string | null =
      content.trim().length > 0 || trace.length > 0 ? appendAi(content, trace) : null

    if (out.actions.length > 0 && messageId) {
      setPendingActions((p) => ({ ...p, [messageId as string]: out.actions }))
    }

    if (out.proposal && result.resume) {
      if (!messageId) messageId = appendAi(out.text || '这一步要你点头我才动手。')
      setProposal({
        ...out.proposal,
        resume: result.resume,
        question: ctx.question,
        history: ctx.history,
        messageId,
      })
      setAgentStatus({
        phase: 'waiting',
        currentTool: out.proposal.toolId,
        currentTask: `等你确认 · ${out.proposal.toolName}`,
      })
    } else if (out.phase === 'error') {
      finishAgentRun('error', { errorMessage: out.errorMessage ?? '模型调用失败' })
    } else if (out.phase === 'waiting') {
      setAgentStatus({ phase: 'waiting', currentTask: '等你确认' })
    } else if (out.phase === 'success') {
      finishAgentRun('success', { currentTask: '完成' })
    } else {
      endAgentRun()
    }

    // 空回答 + 正常结束：给一句实底，别让气泡消失得无影无踪
    if (!messageId && out.phase === 'success') {
      appendAi('天机这次没有给出内容 —— 可以换个说法再问一次。')
    }
    if (out.chime) playSound('notification')
  }

  const send = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busyRef.current) return
    busyRef.current = true
    const runId = beginRun()
    if (!text) setInput('')
    // 换了话题就等于放弃上一个待裁决的提案（不让它悬着）
    if (proposal?.state === 'pending') cancelProposal()
    const history = messages
    setMessages((m) => [...m, { id: createId(), role: 'user', content: q }])
    setBusy(true)
    setStreamText('')
    // 把"天机开始干活了"告诉 AgentStatus —— 桌宠与进度行都读它（单向：这里只写、不读）
    beginAgentRun(q.slice(0, 40))
    await streamTurn(streamHost, {
      runId,
      where: 'tianji:send',
      abortedNote: '已中止',
      request: (signal, onToken) => runTianjiAgent({ question: q, history, signal, onToken }),
      onResult: (result, partial) => finishTurn(runId, result, { question: q, history }, partial),
    })
  }

  /** 用户点了「不用」：不写入任何数据，但在原消息的轨迹里记一笔 —— 免得下一轮模型以为已经生效 */
  const cancelProposal = () => {
    const p = proposal
    if (!p || p.state !== 'pending') return
    setProposal({ ...p, state: 'cancelled' })
    if (p.messageId) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === p.messageId
            ? {
                ...msg,
                trace: [
                  ...(msg.trace ?? []),
                  {
                    toolId: p.toolId,
                    toolName: p.toolName,
                    ok: false,
                    summary: '主人点了不用，未写入',
                  },
                ],
              }
            : msg,
        ),
      )
    }
    endAgentRun()
  }

  /**
   * 用户点了「确认」：执行工具 → **结果回喂** → 继续推理。
   * 失败也**如实回喂**（把错误原文给模型，让它据实作答），而不是糊一句"出了点问题"。
   */
  const confirmProposal = async () => {
    const p = proposal
    if (!p || p.state !== 'pending' || busyRef.current) return
    busyRef.current = true
    const runId = beginRun()
    setBusy(true)

    const tool = agentToolById(p.toolId)
    let ok = false
    let text: string
    if (!tool) {
      text = `找不到工具 ${p.toolId}，没有执行`
    } else {
      try {
        const r = await tool.execute(p.args)
        ok = true
        text = r.text
      } catch (e) {
        text = `执行失败：${e instanceof Error ? e.message : String(e)}`
      }
    }
    // 执行期间用户开了新对话：写入已经发生，但回执不该出现在清空后的会话里
    if (!isCurrentRun(runId)) return

    if (!ok) {
      setProposal({ ...p, state: 'cancelled' })
      finishAgentRun('error', { errorMessage: text })
      useToastStore.getState().push(text, 'danger')
      setBusy(false)
      busyRef.current = false
      return
    }

    setProposal({ ...p, state: 'done' })
    // 回执用**工具自己给的话**（"已记住：「…」"），界面不另写文案
    useToastStore.getState().push(text, 'success')

    // 续跑：把"已执行的结果"作为 seed 送回循环，让模型据此收尾
    const toolTrace: ChatTrace = { toolId: p.toolId, toolName: p.toolName, ok: true, summary: text }
    setStreamText('')
    setAgentStatus({ phase: 'working', currentTool: p.toolId, currentTask: p.toolName })
    await streamTurn(streamHost, {
      runId,
      where: 'tianji:resume',
      // 写入已经成功，只是"收尾那句话"没说出来 —— 如实区分，别让用户以为白记了
      abortedNote: '已中止（写入本身已完成）',
      trace: [toolTrace],
      request: (signal, onToken) =>
        runTianjiAgent({
          question: p.question,
          history: p.history,
          seed: resumeWithResult(p.resume, p.toolId, { text }),
          signal,
          onToken,
        }),
      onResult: (r2, partial) =>
        finishTurn(runId, r2, { question: p.question, history: p.history, priorTrace: [toolTrace] }, partial),
    })
  }

  /** 新对话：中止在途请求、清空当前会话（连同本地存档），回到看板 */
  const newChat = () => {
    // 先作废在途请求：abort 只让请求停下，代次才让它**不再写入**新会话
    abortRef.current?.abort()
    abortRef.current = null
    runIdRef.current++
    clearFlush()
    saveHistory([])
    setMessages([])
    setInput('')
    setPendingActions({})
    resetResolved()
    setProposal(null)
    setStreamText('')
    setBusy(false)
    busyRef.current = false
    // 会话清空 = 这轮结束了：桌宠回 idle（否则会一直停在"等你确认"）
    endAgentRun()
  }

  /**
   * 快捷能力：以「能力名 + 结果」的对话形式入流。
   * 与自由问答共用同一条流式通道，所以能力卡片也是边生成边显示。
   */
  const runCap = async (key: TianjiCapabilityKey) => {
    if (busyRef.current) return
    const cap = TIANJI_CAPABILITIES.find((c) => c.key === key)
    if (!cap) return
    busyRef.current = true
    const runId = beginRun()
    setMessages((m) => [...m, { id: createId(), role: 'user', content: `${cap.label}（天机一键运行）` }])
    setBusy(true)
    setStreamText('')
    beginAgentRun(cap.label)
    const stream = throttled()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const { title, body } = await withStreamSink({ onDelta: stream.push, signal: ctrl.signal }, () =>
        runTianjiCapability(key, stats),
      )
      if (!isCurrentRun(runId)) return
      appendAi(`【${title}】\n\n${body}`)
      finishAgentRun('success', { currentTask: '完成' })
      playSound('notification')
    } catch (e) {
      if (!isCurrentRun(runId)) return
      const aborted = ctrl.signal.aborted
      const partial = stripProtocolBlocks(stream.text())
      appendAi(
        withNote(
          partial,
          aborted ? '已中止' : `${cap.label} 生成失败：${describeAiFailure(e)}`,
        ),
      )
      if (aborted) {
        endAgentRun()
      } else {
        finishAgentRun('error', { errorMessage: `${cap.label} 生成失败` })
        recordAiFailure('tianji:capability', e)
      }
    } finally {
      if (isCurrentRun(runId)) {
        clearFlush()
        abortRef.current = null
        setStreamText('')
        setBusy(false)
        busyRef.current = false
      }
    }
  }

  /** 重试上一问：把最后一条用户消息原样再发（失败 / 中止后最常用的出口） */
  const retry = () => {
    if (busyRef.current) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    void send(lastUser.content)
  }

  return {
    messages,
    input,
    setInput,
    busy,
    streamText,
    pendingActions,
    resolved,
    settling: running,
    proposal: proposal
      ? { toolName: proposal.toolName, summary: proposal.summary, state: proposal.state }
      : null,
    stats,
    send: (t) => void send(t),
    retry,
    stop: () => abortRef.current?.abort(),
    newChat,
    confirmAction: (messageId, j, a) => void confirmAction(messageId, j, a),
    skipAction,
    confirmProposal: () => void confirmProposal(),
    cancelProposal,
    runCap: (k) => void runCap(k),
  }
}
