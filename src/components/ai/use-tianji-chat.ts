/**
 * 天机 · 会话编排（**组件之外的那一半**；Step 4-3 · 二/三/五）
 *
 * ## 为什么从面板里搬出来
 * Step 4-3 给面板加了确认门的两端（提案上屏 + 确认后续跑），`AiChatPanel.tsx`
 * 因此顶到 483 行 —— 超过单文件 400 行上限。而"会话怎么进行"（发问 / 续跑 /
 * 落库 / 换新）与"面板怎么画"本来就是两件事：前者是状态机，后者是布局。
 *
 * ## 它管什么
 *  · 会话状态：messages / input / busy / streamText / 待确认的动作与提案；
 *  · 会话动作：send / stop / newChat / confirmAction / skipAction /
 *    confirmProposal / cancelProposal / runCap。
 *
 * 面板只负责取这些状态、把它们画出来，并把滚动与快捷键留给自己。
 *
 * ## 两条纪律（沿用旧面板，不是新规矩）
 *  · **只在收齐后解析**：流式过程中的增量 JSON 不完整，动作与工具都必须等回答完整；
 *  · **中止 ≠ 出错**：用户点停止不该让桌宠黑脸（与 `services/ai/health.ts` 同一口径）。
 */
import { useRef, useState } from 'react'
import { useTodayStats } from '../../hooks/useTodayStats'
import { createId } from '../../utils/id'
import { playSound } from '../../services/sound'
import { beginAgentRun, endAgentRun, finishAgentRun, setAgentStatus } from '../../services/agent/status'
import { resumeWithResult, type AgentResume } from '../../services/agent/loop'
import { withStreamSink } from '../../services/ai/stream-sink'
import { createStreamThrottle, type StreamThrottle } from './stream-throttle'
import { useToastStore } from '../ui/toast-store'
import { actionDefFor, actionSpecs, agentToolById } from './plugins'
import { loadHistory, saveHistory, type ChatMessage, type ChatTrace } from './chat-history'
import { runTianjiAgent } from './agent-run'
import { TIANJI_CAPABILITIES, runTianjiCapability, type TianjiCapabilityKey } from './tianji-capability'
import { parseTianjiActions, type TianjiActionPayload } from './action-protocol'
import { applyTianjiAction } from './action-runner'
import { actionTitle } from './action-text'
import type { ToolConfirmState } from './tool-confirm'

/** 面板渲染提案需要的最小形状（内部账不外泄） */
export interface ProposalView {
  toolName: string
  summary: string
  state: ToolConfirmState
}

/** 一个等着用户裁决的工具提案（只可能是 `requires-confirmation` 的工具） */
interface ProposalState {
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
}

/** 流式增量的节流间隔：长回答逐 token setState 会触发数百次渲染 */
const FLUSH_MS = 60

export interface TianjiChat {
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  busy: boolean
  streamText: string
  pendingActions: Record<number, TianjiActionPayload[]>
  resolved: Record<string, 'done' | 'skip'>
  proposal: ProposalView | null
  stats: ReturnType<typeof useTodayStats>
  send: (text?: string) => void
  /** 重试上一问（失败 / 中止后的出口；把最后一条用户消息再发一次） */
  retry: () => void
  stop: () => void
  newChat: () => void
  confirmAction: (i: number, j: number, a: TianjiActionPayload) => void
  skipAction: (i: number, j: number) => void
  confirmProposal: () => void
  cancelProposal: () => void
  runCap: (key: TianjiCapabilityKey) => void
}

export function useTianjiChat(): TianjiChat {
  // 天机 = 内置小 agent：打开即恢复上次会话（本地存档），不再每次清空
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [pendingActions, setPendingActions] = useState<Record<number, TianjiActionPayload[]>>({})
  const [resolved, setResolved] = useState<Record<string, 'done' | 'skip'>>({})
  /** 待裁决的工具提案：同时最多一个 —— 一次只让用户决定一件事 */
  const [proposal, setProposal] = useState<ProposalState | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** 当前这一轮的流式节流器（一次运行一个；收尾时清掉挂起的刷新） */
  const flushRef = useRef<StreamThrottle | null>(null)
  const stats = useTodayStats()

  /** 追加一条天机回答（带本轮真实工具轨迹，供下一轮会话历史使用） */
  const appendAi = (content: string, trace: ChatTrace[] = []) => {
    setMessages((m) => [...m, { id: createId(), role: 'ai', content, trace: trace.length > 0 ? trace : undefined }])
  }

  /** 结束原因必须让用户看见：撞上限 / 模型出错与"正常答完"是两回事（规格 §C5） */
  const withNote = (answer: string, note?: string) => [answer, note ? `（${note}）` : ''].filter(Boolean).join('\n\n')

  /**
   * 开一次新的流式节流器（**每次运行一个**：自带装配器与定时器，互不串味）。
   * 具体节流与装配在 `stream-throttle.ts` / `stream-assembly.ts`，这里只管接线。
   */
  const throttled = () => {
    const s = createStreamThrottle(setStreamText, FLUSH_MS)
    flushRef.current = s
    return s
  }

  /** 一次运行收尾时清掉挂起的刷新（`finally` 里调，所以走 ref 而不是局部变量） */
  const clearFlush = () => {
    flushRef.current?.clear()
    flushRef.current = null
  }

  const send = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    if (!text) setInput('')
    // 换了话题就等于放弃上一个待裁决的提案（不让它悬着）
    if (proposal?.state === 'pending') cancelProposal()
    const history = messages
    setMessages((m) => [...m, { id: createId(), role: 'user', content: q }])
    setBusy(true)
    setStreamText('')
    // 把"天机开始干活了"告诉 AgentStatus —— 桌宠与进度行都读它（单向：这里只写、不读）
    beginAgentRun(q.slice(0, 40))
    const stream = throttled()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let truncated = false
    try {
      // 走 **Agent Loop**（多轮工具调用）——旧的一次性 ask 已由它取代（见 agent-run.ts）
      const result = await runTianjiAgent({
        question: q,
        history,
        signal: ctrl.signal,
        onToken: stream.push,
        onFinish: (info) => {
          truncated = info.reason === 'length'
        },
      })

      // ① 停在「需要你确认」的工具上：出卡片、等裁决（**此刻什么都没写入**）
      if (result.reason === 'needs-confirmation' && result.proposal && result.resume) {
        const p = result.proposal
        const answer = withNote(result.answer, result.note)
        setProposal({
          toolId: p.toolId,
          toolName: p.toolName,
          summary: agentToolById(p.toolId)?.confirmSummary?.(p.args) ?? '（这个工具没有给出说明）',
          args: p.args,
          resume: result.resume,
          question: q,
          history,
          state: 'pending',
        })
        // 正文（"我建议…，等你点一下"）先上屏；模型没留正文时也要有一句，否则用户看到空白
        appendAi(answer || '这一步要你点头我才动手 —— 上面就是我想做的事。', result.trace)
        setAgentStatus({ phase: 'waiting', currentTool: p.toolId, currentTask: `等你确认 · ${p.toolName}` })
        playSound('notification')
        return
      }

      const answer = withNote(result.answer, result.note)
      // 回答收齐后再解析动作：流式过程中的增量 JSON 不完整、不可校验，绝不中途解析
      // 规格表来自插件注册表 —— 协议本身不认识任何具体动作
      const proposed = parseTianjiActions(answer, actionSpecs())
      if (proposed.length > 0) {
        const aiIndex = messages.length + 1
        setPendingActions((p) => ({ ...p, [aiIndex]: proposed }))
        // 有待确认的动作 → 桌宠进 waiting（"主人，这里要你点一下"）
        setAgentStatus({ phase: 'waiting', currentTask: '等你确认' })
      } else if (result.reason === 'error') {
        finishAgentRun('error', { errorMessage: result.errorMessage ?? '模型调用失败' })
      } else {
        finishAgentRun('success', { currentTask: '完成' })
      }
      // 被截断必须说出来，否则用户会把"写到一半就停"当成回答自然结束
      const content = truncated
        ? `${answer}\n\n（回答超出长度上限被截断，可让我"接着说"）`
        : answer || '天机这次没有给出内容 —— 可以换个说法再问一次。'
      appendAi(content, result.trace)
      // 回答到货提示一声：长回答要等十几秒，人往往已经切去别的板块，
      // 没有声音就只能一直盯着 —— 这是 tap 族"轻通知"的标准场景
      playSound('notification')
    } catch {
      appendAi(ctrl.signal.aborted ? '（已中止）' : '天机暂时没有回应，请稍后再试。')
      // 中止是用户动作（不是故障）；真失败才进 error —— 桌宠据此黑脸，而不是冲用户
      if (ctrl.signal.aborted) endAgentRun()
      else finishAgentRun('error', { errorMessage: '天机暂时没有回应' })
    } finally {
      clearFlush()
      abortRef.current = null
      setStreamText('')
      setBusy(false)
    }
  }

  /** 用户点了「不用」：不写入任何数据，但在历史里记一笔 —— 免得下一轮模型以为已经生效 */
  const cancelProposal = () => {
    const p = proposal
    if (!p || p.state !== 'pending') return
    setProposal({ ...p, state: 'cancelled' })
    setMessages((m) =>
      m.map((msg, i) =>
        i === m.length - 1 && msg.role === 'ai'
          ? {
              ...msg,
              trace: [
                ...(msg.trace ?? []),
                { toolId: p.toolId, toolName: p.toolName, ok: false, summary: '主人点了不用，未写入' },
              ],
            }
          : msg,
      ),
    )
    endAgentRun()
  }

  /**
   * 用户点了「确认」：执行工具 → **结果回喂** → 继续推理。
   *
   * 失败也**如实回喂**（把错误原文给模型，让它据实作答），
   * 而不是让界面糊一句"好像出了点问题"。
   */
  const confirmProposal = async () => {
    const p = proposal
    if (!p || p.state !== 'pending' || busy) return
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
    setProposal({ ...p, state: ok ? 'done' : 'cancelled' })
    appendAi('', [{ toolId: p.toolId, toolName: p.toolName, ok, summary: text }])
    if (!ok) {
      finishAgentRun('error', { errorMessage: text })
      useToastStore.getState().push(text, 'danger')
      setBusy(false)
      return
    }
    // 回执用**工具自己给的话**（"已记住：「…」"），界面不另写文案
    useToastStore.getState().push(text, 'success')

    // 续跑：把"已执行的结果"作为 seed 送回循环，让模型据此收尾
    const stream = throttled()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStreamText('')
    setAgentStatus({ phase: 'working', currentTool: p.toolId, currentTask: p.toolName })
    try {
      const r2 = await runTianjiAgent({
        question: p.question,
        history: p.history,
        seed: resumeWithResult(p.resume, p.toolId, { text }),
        signal: ctrl.signal,
        onToken: stream.push,
      })
      const content = withNote(r2.answer, r2.note)
      if (content) {
        appendAi(content, [{ toolId: p.toolId, toolName: p.toolName, ok: true, summary: text }, ...r2.trace])
      }
      if (r2.reason === 'error') {
        finishAgentRun('error', { errorMessage: r2.errorMessage ?? '模型调用失败' })
      } else {
        finishAgentRun('success', { currentTask: '完成' })
      }
    } catch (e) {
      // 写入已经成功，只是"收尾那句话"没说出来 —— 如实区分，别让用户以为白记了
      finishAgentRun('error', {
        errorMessage: ctrl.signal.aborted ? '已中止（写入本身已完成）' : e instanceof Error ? e.message : String(e),
      })
    } finally {
      clearFlush()
      abortRef.current = null
      setStreamText('')
      setBusy(false)
    }
  }

  /** 新对话：清空当前会话（连同本地存档），回到看板 */
  const newChat = () => {
    saveHistory([])
    setMessages([])
    setInput('')
    setPendingActions({})
    setResolved({})
    setProposal(null)
    // 会话清空 = 这轮结束了：桌宠回 idle（否则会一直停在"等你确认"）
    endAgentRun()
  }

  /** 用户点「确认」才真正落库；成功后置为 done 显示已加入，失败则由 store 内部已提示错误 */
  const confirmAction = async (i: number, j: number, a: TianjiActionPayload) => {
    const ok = await applyTianjiAction(a)
    setResolved((r) => ({ ...r, [`${i}-${j}`]: ok ? 'done' : 'skip' }))
    // 确认这一下就是 Agent 的"等待"结束：落库成功 → 收工；失败 → 进 error（桌宠黑脸）
    if (ok) finishAgentRun('success', { currentTask: '已落库' })
    else finishAgentRun('error', { errorMessage: '落库失败' })
    if (ok) {
      // 中文名取自归属插件（**不在这里硬编码具体动作名** —— 那正是 P2 开放化要消除的）
      const label = actionDefFor(a.action)?.label ?? a.action
      useToastStore.getState().push(`已加入${label}：${actionTitle(a)}`, 'success')
    }
  }

  /** 用户点「忽略」：丢弃该提议，不写入任何数据 */
  const skipAction = (i: number, j: number) => {
    setResolved((r) => ({ ...r, [`${i}-${j}`]: 'skip' }))
    // 忽略 ≠ 出错，也不是成功：直接回到待命（桌宠不再等）
    endAgentRun()
  }

  /**
   * 快捷能力：以「能力名 + 结果」的对话形式入流。
   *
   * 与自由问答共用同一条流式通道（withStreamSink + 同一个装配器 + 同一个预览区），
   * 所以能力卡片现在也是边生成边显示 —— 这是此前"点了等一次性出"的四张卡片。
   */
  const runCap = async (key: TianjiCapabilityKey) => {
    if (busy) return
    const cap = TIANJI_CAPABILITIES.find((c) => c.key === key)
    if (!cap) return
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
      appendAi(`【${title}】\n\n${body}`)
      finishAgentRun('success', { currentTask: '完成' })
      playSound('notification')
    } catch {
      appendAi(ctrl.signal.aborted ? '（已中止）' : `${cap.label} 生成失败，请检查远程 AI 配置后重试。`)
      if (ctrl.signal.aborted) endAgentRun()
      else finishAgentRun('error', { errorMessage: `${cap.label} 生成失败` })
    } finally {
      clearFlush()
      abortRef.current = null
      setStreamText('')
      setBusy(false)
    }
  }

  /** 重试上一问：把最后一条用户消息原样再发（2026-10-02；失败 / 中止后最常用的出口） */
  const retry = () => {
    if (busy) return
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
    proposal: proposal ? { toolName: proposal.toolName, summary: proposal.summary, state: proposal.state } : null,
    stats,
    send: (t) => void send(t),
    retry,
    stop: () => abortRef.current?.abort(),
    newChat,
    confirmAction: (i, j, a) => void confirmAction(i, j, a),
    skipAction,
    confirmProposal: () => void confirmProposal(),
    cancelProposal,
    runCap: (k) => void runCap(k),
  }
}
