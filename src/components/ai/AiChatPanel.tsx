/**
 * AI 对话 —— 全局入口（手机全屏 / 桌面居中卡片）
 *
 * 定位：把散落各处的 AI 按钮（学习计划/今日简报/AI整理/任务拆解）收编为一个
 * 「直接提问」的统一入口。提问时自动携带本机关键数据上下文（今日任务 / 课程 /
 * 待办到期 / 近期情报 / 本月收支），让 AI 能回答「我今天还有什么事」「这月花了
 * 多少」「最近关注什么」这类需要看数据的问题。
 *
 * 远程未就绪时回退本地规则概述（不假装智能）；远程就绪则完整问答。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, CornerDownLeft, Send, Sparkles, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { aiService } from '../../services/ai/ai-service'
import { useTaskStore } from '../../stores/useTaskStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { Task, IntelligenceItem, FinanceRecord, Course } from '../../types/entities'
import { todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'
import { hasActiveOverlay } from '../ui/overlay'

interface ChatMessage {
  role: 'user' | 'ai'
  content: string
}

interface AIChatState {
  open: boolean
  setOpen: (v: boolean) => void
}

export const useAIChatStore = create<AIChatState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

/** 收集本机数据上下文：任务 / 课程 / 情报 / 收支 / 偏好（读取快照，不订阅） */
function buildContext(): string {
  const today = todayISO()
  const tasks: Task[] = useTaskStore.getState().items
  const courses: Course[] = useCourseStore.getState().items
  const items: IntelligenceItem[] = useIntelligenceStore.getState().items
  const fins: FinanceRecord[] = useFinanceStore.getState().items
  const goals = useSettingsStore.getState().waterGoalMl

  const open = tasks.filter((t) => !t.done)
  const todayTasks = open.filter((t) => t.dueDate?.startsWith(today))
  const month = today.slice(0, 7)
  const income = fins.filter((f) => f.kind === 'income' && f.date.startsWith(month)).reduce((s, f) => s + f.amount, 0)
  const expense = fins.filter((f) => f.kind === 'expense' && f.date.startsWith(month)).reduce((s, f) => s + f.amount, 0)

  const lines: string[] = []
  lines.push(`今天日期：${today}`)
  if (todayTasks.length > 0) lines.push(`今日任务：${todayTasks.slice(0, 8).map((t: Task) => t.title).join('、')}`)
  else if (open.length > 0) lines.push(`待办共 ${open.length} 项（今日无明确到期），最近：${open.slice(0, 5).map((t: Task) => t.title).join('、')}`)
  else lines.push('暂无待办')
  lines.push(`课程 ${courses.length} 门：${courses.slice(0, 8).map((c: Course) => c.name).join('、') || '未添加'}`)
  if (items.length > 0) lines.push(`近期情报 ${items.length} 条，最新：${items.slice(0, 5).map((i: IntelligenceItem) => i.title).join('、')}`)
  lines.push(`本月收入 ¥${income.toFixed(2)} · 支出 ¥${expense.toFixed(2)}（项目内可追问明细）`)
  if (goals) lines.push(`今日饮水目标 ${goals}ml`)
  return lines.join('\n')
}

/** 提问入口：远程就绪走完整问答，否则本地概述（绝不报错打断） */
async function ask(prompt: string): Promise<string> {
  const ctx = buildContext()
  const provider = aiService.provider
  if (provider.id === 'remote' && provider.available()) {
    const full = `以下是知白台用户今日的真实数据（用于回答与用户生活/任务相关的问题）：\n${ctx}\n\n用户问题：${prompt}\n\n要求：中文回答，简洁有条理；数据相关问题直接引用上方数据；与数据无关的通用问题正常回答。`
    try {
      return await provider.complete(full)
    } catch {
      // 远程失败（超时/限流）降级为本地概述
    }
  }
  return `（本地规则 · 未接入远程 AI）基于你的数据：\n${ctx}\n\n你问的是：「${prompt}」\n\n在「系统 · 智能情报」配置远程 AI（Base URL / 模型 / Key）后，可针对你的数据得到完整的分析与建议。`
}

function WelcomeHints({ onPick }: { onPick: (q: string) => void }) {
  const hints = ['我今天还有哪些事？', '这月花了多少钱？', '最近在关注什么？', '帮我规划今天下午']
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-3">
      {hints.map((h) => (
        <button
          key={h}
          onClick={() => onPick(h)}
          className="rounded-tile border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          {h}
        </button>
      ))}
    </div>
  )
}

export function AiChatPanel() {
  const open = useAIChatStore((s) => s.open)
  const setOpen = useAIChatStore((s) => s.setOpen)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hasActiveOverlay()) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // 打开时清空会话，每次都是新的开始
  useEffect(() => {
    if (open) {
      setMessages([])
      setInput('')
    }
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  const remoteReady = useMemo(
    () => aiService.provider.id === 'remote' && aiService.provider.available(),
    // 每次打开时评估；provider 由设置页在生命周期外切换，这里仅在 open 变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  )

  const send = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    if (!text) setInput('')
    setMessages((m) => [...m, { role: 'user', content: q }])
    setBusy(true)
    try {
      const answer = await ask(q)
      setMessages((m) => [...m, { role: 'ai', content: answer }])
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
        aria-label="AI 对话"
        className={cn(
          'relative flex flex-col bg-paper shadow-overlay animate-[page-fade_150ms_var(--ease-standard)]',
          'w-full h-full',
          'md:my-auto md:mx-auto md:h-[min(72vh,640px)] md:max-w-xl md:rounded-sheet md:border md:border-line',
        )}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal/12 text-teal">
            <Bot size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="display text-sm font-semibold text-ink">AI 问问</div>
            <div className="truncate text-[10px] text-ink-faint">
              {remoteReady ? '已接入远程 AI · 可回答你的数据相关问题' : '未配置远程 AI · 当前仅本地规则概览'}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="关闭 AI 对话"
            className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* 消息流 */}
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 pb-10 text-center">
              <Sparkles size={22} className="text-bronze" />
              <p className="text-sm text-ink-muted">想说点什么？关于任务、课程、情报或收支都可以直接问。</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                    m.role === 'user'
                      ? 'rounded-br-sm bg-teal text-on-sidebar'
                      : 'rounded-bl-sm bg-raised text-ink',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {busy && (
            <div className="flex items-center gap-1.5 px-1 text-[11px] text-ink-faint">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bronze" />
              正在思考…
            </div>
          )}
        </div>

        {/* 快捷提问 + 输入 */}
        {messages.length === 0 && <WelcomeHints onPick={(q) => { setInput(q); void send(q) }} />}
        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          <CornerDownLeft size={13} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={remoteReady ? '输入问题，回车发送…' : '输入问题（配置远程 AI 后得到深度回答）'}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            aria-label="发送"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-on-sidebar transition-opacity disabled:opacity-35"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}