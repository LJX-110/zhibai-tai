/**
 * 天机 —— AI 总调度（全局入口：手机全屏 / 桌面居中卡片）
 *
 * 定位：知白台唯一的 AI 入口。把散落各处的 AI 按钮（今日简报 / 学习计划 /
 * 项目摘要 / 总结情报 / 解卦）收编为「快捷能力」，既可直接自由对话，也可一键
 * 点能力卡片，由天机自动携带本机数据（任务 / 课程 / 情报 / 收支）生成结果。
 *
 * 远程未就绪时回退本地规则概述（不假装智能）；远程就绪则完整问答。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：本文件只保留「组件状态 + 副作用 +
 * 会话动作 + 区块组合」。协议、提问链路、快捷能力、历史存档、开关 store、
 * 头部 / 消息流 / 输入区各在 ./ 下自成文件（见各文件头部注释）。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getAiRemoteHealth, subscribeAiRemoteHealth } from '../../services/ai/health'
import { useTodayStats } from '../../hooks/useTodayStats'
import { createId } from '../../utils/id'
import { cn } from '../../utils/cn'
import { hasActiveOverlay } from '../ui/overlay'
import { useToastStore } from '../ui/Toast'
import { useAIChatStore } from './chat-store'
import { loadHistory, saveHistory, type ChatMessage } from './chat-history'
import { ask } from './tianji-ask'
import { TIANJI_CAPABILITIES, runTianjiCapability, type TianjiCapabilityKey } from './tianji-capability'
import { parseTianjiActions, type TianjiActionPayload } from './action-protocol'
import { applyTianjiAction } from './action-runner'
import { actionTitle } from './action-cards'
import { ChatHeader } from './ChatHeader'
import { MessageStream } from './MessageStream'
import { ChatInput } from './ChatInput'

export function AiChatPanel() {
  const open = useAIChatStore((s) => s.open)
  const setOpen = useAIChatStore((s) => s.setOpen)
  // 天机 = 内置小 agent：打开即恢复上次会话（本地存档），不再每次清空
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  /** 正在流式生成的文本（边收边显示；完成时并入 messages） */
  const [streamText, setStreamText] = useState('')
  /** 每条 AI 消息提议的动作（按消息下标索引；只在回答收齐后写入，刷新后不恢复） */
  const [pendingActions, setPendingActions] = useState<Record<number, TianjiActionPayload[]>>({})
  /** 已处理的动作：`done`=已确认落库，`skip`=已忽略（隐藏卡片，避免重复写入） */
  const [resolved, setResolved] = useState<Record<string, 'done' | 'skip'>>({})
  const abortRef = useRef<AbortController | null>(null)
  const accRef = useRef('')
  const flushRef = useRef<number | undefined>(undefined)
  const listRef = useRef<HTMLDivElement>(null)
  /** 是否"贴着底部"：流式增量不断把气泡撑长，只有本来就在底部才跟随滚动，
   *  用户上滑回看前文时不抢滚动位置（否则长回答会被一直拽回结尾） */
  const stickToBottom = useRef(true)
  const stats = useTodayStats()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hasActiveOverlay()) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // 消息变化即持久化（多轮上下文 + 跨打开保留的依据）
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

  useEffect(() => {
    // 空会话时消息区放的是看板，从头读起；此时贴底会把看板顶出视野
    if (messages.length === 0) return
    // 主动发言/收到回答后必然想看最新一条，重新贴底（之后由用户滚动决定是否继续跟随）
    stickToBottom.current = true
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  /** 记录用户是否滚到底部（供流式跟随判断） */
  const onListScroll = () => {
    const el = listRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  useEffect(() => {
    if (!streamText || !stickToBottom.current) return
    const el = listRef.current
    el?.scrollTo({ top: el.scrollHeight })
  }, [streamText])

  /**
   * 远程状态 —— 三态而非布尔（未配置 / 就绪 / **降级**）。
   * 订阅式取值：远程调用失败发生在用户提问的过程中，那时组件早就在屏幕上了，
   * 之前的 `useMemo([open])` 只在打开面板时评估一次，降级根本传不下来。
   */
  const remote = useSyncExternalStore(subscribeAiRemoteHealth, getAiRemoteHealth)

  const send = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    if (!text) setInput('')
    setMessages((m) => [...m, { id: createId(), role: 'user', content: q }])
    setBusy(true)
    setStreamText('')
    accRef.current = ''
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const answer = await ask(q, messages, {
        signal: ctrl.signal,
        onToken: (delta) => {
          accRef.current += delta
          // 节流 60ms：长回答逐 token setState 会触发数百次渲染
          if (flushRef.current === undefined) {
            flushRef.current = window.setTimeout(() => {
              flushRef.current = undefined
              setStreamText(accRef.current)
            }, 60)
          }
        },
      })
      // 回答收齐后再解析动作：流式过程中的增量 JSON 不完整、不可校验，绝不中途解析
      const proposed = parseTianjiActions(answer)
      if (proposed.length > 0) {
        const aiIndex = messages.length + 1
        setPendingActions((p) => ({ ...p, [aiIndex]: proposed }))
      }
      setMessages((m) => [...m, { id: createId(), role: 'ai', content: answer }])
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: createId(),
          role: 'ai',
          content: ctrl.signal.aborted ? '（已中止）' : '天机暂时没有回应，请稍后再试。',
        },
      ])
    } finally {
      window.clearTimeout(flushRef.current)
      flushRef.current = undefined
      accRef.current = ''
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
  }

  /** 用户点「确认」才真正落库；成功后置为 done 显示已加入，失败则由 store 内部已提示错误 */
  const confirmAction = async (i: number, j: number, a: TianjiActionPayload) => {
    const ok = await applyTianjiAction(a)
    setResolved((r) => ({ ...r, [`${i}-${j}`]: ok ? 'done' : 'skip' }))
    if (ok) {
      const label = a.action === 'create_task' ? '待办' : a.action === 'create_note' ? '笔记' : '收支'
      useToastStore.getState().push(`已加入${label}：${actionTitle(a)}`, 'success')
    }
  }

  /** 用户点「忽略」：丢弃该提议，不写入任何数据 */
  const skipAction = (i: number, j: number) => {
    setResolved((r) => ({ ...r, [`${i}-${j}`]: 'skip' }))
  }

  /** 快捷能力：以「能力名 + 结果」的对话形式入流 */
  const runCap = async (key: TianjiCapabilityKey) => {
    if (busy) return
    const cap = TIANJI_CAPABILITIES.find((c) => c.key === key)
    if (!cap) return
    setMessages((m) => [...m, { id: createId(), role: 'user', content: `${cap.label}（天机一键运行）` }])
    setBusy(true)
    try {
      const { title, body } = await runTianjiCapability(key, stats)
      setMessages((m) => [...m, { id: createId(), role: 'ai', content: `【${title}】\n\n${body}` }])
    } catch {
      setMessages((m) => [...m, { id: createId(), role: 'ai', content: `${cap.label} 生成失败，请检查远程 AI 配置后重试。` }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)] flex">
      <div className="absolute inset-0 bg-ink/45" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="天机"
        className={cn(
          'relative flex flex-col bg-paper shadow-overlay anim-enter',
          'w-full h-full',
          'md:my-auto md:mx-auto md:h-[min(72vh,640px)] md:max-w-xl md:rounded-sheet md:border md:border-line',
        )}
      >
        <ChatHeader remote={remote} onNewChat={newChat} onClose={() => setOpen(false)} />

        {/* 消息流 —— space-y-2.5 管段内节奏，轮次之间靠用户气泡的 mt-2 拉开层级：
            全程等距会让"我的问题"和"天机的回答"糊成一片 */}
        <div
          ref={listRef}
          onScroll={onListScroll}
          className="flex-1 space-y-2.5 overscroll-contain overflow-y-auto px-4 py-3"
        >
          <MessageStream
            messages={messages}
            pendingActions={pendingActions}
            resolved={resolved}
            streamText={streamText}
            busy={busy}
            stats={stats}
            remote={remote}
            onConfirm={(i, j, a) => void confirmAction(i, j, a)}
            onSkip={skipAction}
            onPick={(q) => {
              setInput(q)
              void send(q)
            }}
            onRunCap={(key) => void runCap(key)}
          />
        </div>

        <ChatInput
          input={input}
          onInput={setInput}
          onSend={() => void send()}
          onStop={() => abortRef.current?.abort()}
          busy={busy}
          remote={remote}
        />
      </div>
    </div>,
    document.body,
  )
}
