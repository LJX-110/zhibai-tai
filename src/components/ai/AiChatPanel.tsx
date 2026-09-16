/**
 * 天机 —— AI 总调度（全局入口：手机全屏 / 桌面居中卡片）
 *
 * 定位：知白台唯一的 AI 入口。把散落各处的 AI 按钮（今日简报 / 学习计划 /
 * 项目摘要 / 总结情报 / 解卦）收编为「快捷能力」，既可直接自由对话，也可一键
 * 点能力卡片，由天机自动携带本机数据（任务 / 课程 / 情报 / 收支）生成结果。
 *
 * 远程未就绪时回退本地规则概述（不假装智能）；远程就绪则完整问答。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, CalendarDays, CornerDownLeft, FileText, GraduationCap, NotebookPen, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { aiService } from '../../services/ai/ai-service'
import { useTaskStore } from '../../stores/useTaskStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useCourseStore, useExamStore, useHomeworkStore } from '../../stores/useStudyStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { useHabitLogStore } from '../../stores/useHabitStore'
import { useBodyMetricLogStore } from '../../stores/useBodyStore'
import { useTodayStats } from '../../hooks/useTodayStats'
import { cultivationSources } from '../../services/cultivation'
import type { Task, IntelligenceItem, FinanceRecord, Course } from '../../types/entities'
import { todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'
import { hasActiveOverlay } from '../ui/overlay'

interface ChatMessage {
  role: 'user' | 'ai'
  content: string
}

/** 会话历史本地存档（天机 = 内置小 agent：换页/重开/刷新都保留对话，
 *  只在点「新对话」时清空。存 localStorage 而非业务表：历史不参与跨设备同步） */
const HISTORY_KEY = 'zbt:ai-chat:v1'
const HISTORY_MAX = 60

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) return (parsed as ChatMessage[]).slice(-HISTORY_MAX)
  } catch {
    /* 存档损坏视为空会话 */
  }
  return []
}

function saveHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_MAX)))
  } catch {
    /* 存储满/隐私模式下写不进去就放弃存档，不影响对话 */
  }
}

interface AIChatState {
  open: boolean
  setOpen: (v: boolean) => void
}

export const useAIChatStore = create<AIChatState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

/** 收集本机数据上下文：任务 / 课程 / 情报 / 收支 / 修 / 学 / 偏好（读取快照，不订阅）。
 *  天机 = 智能管家：管到各板块的实时状态，不只是回答"有什么任务"。 */
function buildContext(): string {
  const today = todayISO()
  const tasks: Task[] = useTaskStore.getState().items
  const courses: Course[] = useCourseStore.getState().items
  const items: IntelligenceItem[] = useIntelligenceStore.getState().items
  const fins: FinanceRecord[] = useFinanceStore.getState().items
  const goals = useSettingsStore.getState().waterGoalMl
  const projects = useProjectStore.getState().items
  const homeworks = useHomeworkStore.getState().items
  const exams = useExamStore.getState().items
  const habitLogs = useHabitLogStore.getState().items
  const bodyLogs = useBodyMetricLogStore.getState().items
  const waterLogs = useWaterStore.getState().items

  const open = tasks.filter((t) => !t.done)
  const todayTasks = open.filter((t) => t.dueDate?.startsWith(today))
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today)
  const month = today.slice(0, 7)
  const income = fins.filter((f) => f.kind === 'income' && f.date.startsWith(month)).reduce((s, f) => s + f.amount, 0)
  const expense = fins.filter((f) => f.kind === 'expense' && f.date.startsWith(month)).reduce((s, f) => s + f.amount, 0)
  const waterToday = waterLogs.filter((w) => w.date === today).reduce((s, w) => s + w.amountMl, 0)
  const doneTodayTasks = tasks.filter((t) => t.done && t.completedAt?.startsWith(today)).length

  const lines: string[] = []
  lines.push(`今天日期：${today}`)
  if (todayTasks.length > 0) lines.push(`今日任务：${todayTasks.slice(0, 8).map((t: Task) => t.title).join('、')}`)
  else if (open.length > 0) lines.push(`待办共 ${open.length} 项（今日无明确到期），最近：${open.slice(0, 5).map((t: Task) => t.title).join('、')}`)
  else lines.push('暂无待办')
  if (overdue.length > 0) lines.push(`已逾期 ${overdue.length} 项：${overdue.slice(0, 4).map((t: Task) => t.title).join('、')}`)
  if (doneTodayTasks > 0) lines.push(`今日已完成 ${doneTodayTasks} 项待办`)
  lines.push(`课程 ${courses.length} 门：${courses.slice(0, 8).map((c: Course) => c.name).join('、') || '未添加'}`)
  if (homeworks.filter((h) => !h.done).length > 0) {
    lines.push(`未交作业 ${homeworks.filter((h) => !h.done).length} 项`)
  }
  if (exams.length > 0) {
    const nextExam = [...exams].sort((a, b) => a.date.localeCompare(b.date))[0]
    lines.push(`最近考试：${nextExam.title}（${nextExam.date}）`)
  }
  if (projects.length > 0) lines.push(`项目 ${projects.length} 个，进行中：${projects.filter((p) => p.status === 'developing').map((p) => p.name).join('、') || '—'}`)
  if (items.length > 0) lines.push(`近期情报 ${items.length} 条（未读 ${items.filter((it) => !it.read).length}），最新：${items.slice(0, 5).map((i: IntelligenceItem) => i.title).join('、')}`)
  lines.push(`本月收入 ¥${income.toFixed(2)} · 支出 ¥${expense.toFixed(2)}（可追问明细）`)
  lines.push(`今日饮水 ${waterToday}/${goals}ml · 斩三尸打卡 ${habitLogs.filter((l) => l.date === today).length} 次 · 身体记录 ${bodyLogs.filter((l) => l.date === today).length} 条`)
  return lines.join('\n')
}

/** 提问入口：远程就绪走完整问答（携带本次会话历史做多轮上下文），否则本地概述（绝不报错打断） */
async function ask(prompt: string, history: ChatMessage[]): Promise<string> {
  const ctx = buildContext()
  const provider = aiService.provider
  if (provider.id === 'remote' && provider.available()) {
    // 长会话压缩：超过 MAX_HISTORY 轮后，把最早的部分压成一条摘要占位，
    // 避免 prompt 过长吞掉上下文预算（天机不会"失忆式"爆长）
    const MAX_HISTORY = 12
    let usable = history
    if (history.length > MAX_HISTORY) {
      const head = history.slice(0, history.length - MAX_HISTORY)
      const tail = history.slice(-MAX_HISTORY)
      const digest = head
        .map((m) => `${m.role === 'user' ? '问' : '答'}：${m.content.replace(/\s+/g, ' ').slice(0, 40)}`)
        .join('；')
      usable = [{ role: 'ai', content: `（更早的对话已压缩）${digest}…` }, ...tail]
    }
    const historyText = usable
      .slice(-MAX_HISTORY)
      .map((m) => `${m.role === 'user' ? '用户' : '天机'}：${m.content}`)
      .join('\n')
    const full = `以下是知白台用户今日的真实数据（用于回答与用户生活/任务相关的问题）：\n${ctx}\n\n对话历史：\n${historyText || '（本会话第一条提问）'}\n\n用户当前问题：${prompt}\n\n要求：中文回答，简洁有条理；数据相关问题直接引用上方数据；与数据无关的通用问题正常回答；能结合对话历史延续上下文。`
    try {
      return await provider.complete(full)
    } catch {
      // 远程失败（超时/限流）降级为本地概述
    }
  }
  return `（本地规则 · 未接入远程 AI）基于你的数据：\n${ctx}\n\n你问的是：「${prompt}」\n\n在「系统 · AI Core」配置远程 AI（Base URL / 模型 / Key）后，可针对你的数据得到完整的分析与建议。`
}

/** 快捷能力：一键运行结构化 AI 任务（今日简报 / 学习计划 / 项目摘要 / 总结情报） */
export type TianjiCapabilityKey = 'brief' | 'plan' | 'project' | 'intel'

export const TIANJI_CAPABILITIES: {
  key: TianjiCapabilityKey
  label: string
  desc: string
  icon: typeof Bot
}[] = [
  { key: 'brief', label: '今日简报', desc: '汇总今日完成/专注/饮水/道行', icon: CalendarDays },
  { key: 'plan', label: '学习计划', desc: '按课程/作业/考试生成建议', icon: GraduationCap },
  { key: 'project', label: '项目摘要', desc: '项目进度与里程碑摘要', icon: NotebookPen },
  { key: 'intel', label: '总结情报', desc: '最新情报的摘要/标签/重要度', icon: FileText },
]

/** 运行快捷能力，返回 (标题, 正文)；失败时抛错由调用方降级处理 */
export async function runTianjiCapability(
  key: TianjiCapabilityKey,
  stats: ReturnType<typeof useTodayStats>,
): Promise<{ title: string; body: string }> {
  const water = useWaterStore.getState().items
  const waterGoal = useSettingsStore.getState().waterGoalMl
  const courses = useCourseStore.getState().items
  const homeworks = useHomeworkStore.getState().items
  const exams = useExamStore.getState().items
  const projects = useProjectStore.getState().items
  const intel = useIntelligenceStore.getState().items

  if (key === 'brief') {
    const date = todayISO()
    const waterMl = water.filter((w) => w.date === date).reduce((s, w) => s + w.amountMl, 0)
    const body = await aiService.dailyBrief({
      date,
      tasksDone: stats.tasksDone,
      focusMin: stats.focusMinutes,
      waterMl,
      goal: waterGoal,
      sources: cultivationSources({
        tasksDoneToday: stats.tasksDone,
        focusMinutesToday: stats.focusMinutes,
        waterRatio: stats.waterRatio,
        habitLogsToday: stats.habitLogs,
        bodyLogsToday: stats.bodyLogs,
        notesToday: stats.notesToday,
        creationsToday: stats.creations,
      }),
    })
    return { title: '今日简报', body }
  }
  if (key === 'plan') {
    const body = await aiService.studyPlan({
      courses: courses.map((c) => ({ name: c.name })),
      undone: homeworks.filter((h) => !h.done).length,
      exams: exams.map((e) => ({ title: e.title, date: e.date })),
    })
    return { title: '学习计划', body }
  }
  if (key === 'project') {
    const p = projects[0]
    if (!p) {
      return { title: '项目摘要', body: '还没有项目。去「藏 · 项目中心」新建一个项目，天机会为你生成摘要。' }
    }
    const body = await aiService.projectSummary(p)
    return { title: '项目摘要', body }
  }
  const it = [...intel].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!it) {
    return { title: '情报摘要', body: '还没有情报。去「情」拉取一些情报后，天机会为最新一条生成摘要与标签。' }
  }
  const [summary, tags, rank] = await Promise.all([
    aiService.summarize(it),
    aiService.tag(it),
    aiService.rank(it),
  ])
  return {
    title: '情报摘要',
    body: `标题：${it.title}\n摘要：${summary}\n标签：${tags.join('、')}\n重要度：${rank}`,
  }
}

/** 空会话看板：实时状态（各板块脉搏）+ 能力胶囊 + 快捷问句。
 *  管家先亮出"我已经看到什么"，再给一键动作 —— 不堆 2×2 大卡占屏。 */
function WelcomeBoard({
  stats,
  onPick,
  onRunCap,
}: {
  stats: ReturnType<typeof useTodayStats>
  onPick: (q: string) => void
  onRunCap: (key: TianjiCapabilityKey) => void
}) {
  const today = todayISO()
  const tasks = useTaskStore((s) => s.items)
  const items = useIntelligenceStore((s) => s.items)
  const fins = useFinanceStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)

  const openCount = tasks.filter((t) => !t.done).length
  const dueSoon = tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= today).length
  const unreadIntel = items.filter((it) => !it.read).length
  const month = today.slice(0, 7)
  const expense = fins
    .filter((f) => f.kind === 'expense' && f.date.startsWith(month))
    .reduce((s, f) => s + f.amount, 0)

  const pulse: { label: string; value: string; tone: 'cinnabar' | 'teal' | 'bronze' | 'plain' }[] = [
    { label: '待办', value: openCount > 0 ? `${openCount} 项` : '清空', tone: openCount > 0 ? 'cinnabar' : 'teal' },
    { label: '近日到期', value: dueSoon > 0 ? `${dueSoon} 项` : '无', tone: dueSoon > 0 ? 'cinnabar' : 'plain' },
    { label: '课程', value: courses.length > 0 ? `${courses.length} 门` : '未设', tone: 'teal' },
    { label: '情报未读', value: unreadIntel > 0 ? `${unreadIntel} 条` : '无', tone: unreadIntel > 0 ? 'bronze' : 'plain' },
    { label: '本月支出', value: expense > 0 ? `¥${Math.round(expense).toLocaleString()}` : '—', tone: 'bronze' },
    { label: '今日专注', value: stats.focusMinutes > 0 ? `${stats.focusMinutes}m` : '—', tone: 'teal' },
  ]

  return (
    <div className="border-t border-line px-4 pb-3 pt-3">
      {/* 实时状态：一眼看到全局（管家已接管各板块） */}
      <div className="mb-2 text-[11px] tracking-[0.18em] text-ink-faint">实时状态 · 各板块脉搏</div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {pulse.map((p) => (
          <div key={p.label} className="rounded-tile border border-line bg-paper/50 px-2.5 py-1.5">
            <div className="text-[10px] text-ink-faint">{p.label}</div>
            <div
              className={cn(
                'mt-0.5 truncate text-[13px] font-medium',
                p.tone === 'cinnabar' ? 'text-cinnabar' : p.tone === 'teal' ? 'text-teal' : p.tone === 'bronze' ? 'text-bronze' : 'text-ink',
              )}
            >
              {p.value}
            </div>
          </div>
        ))}
      </div>

      {/* 能力胶囊：一行横滚，不再 2×2 占屏 */}
      <div className="mb-2 text-[11px] tracking-[0.18em] text-ink-faint">一键能力</div>
      <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {TIANJI_CAPABILITIES.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.key}
              onClick={() => onRunCap(c.key)}
              className="flex shrink-0 items-center gap-1.5 rounded-tile border border-line bg-paper/70 px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-teal/40 hover:text-teal"
            >
              <Icon size={13} className="text-ink-faint" />
              {c.label}
            </button>
          )
        })}
      </div>

      {/* 快捷问句 */}
      <div className="flex flex-wrap gap-1.5">
        {['我今天还有哪些事？', '这月花了多少钱？', '最近在关注什么？', '帮我规划今天下午'].map((h) => (
          <button
            key={h}
            onClick={() => onPick(h)}
            className="rounded-tile border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AiChatPanel() {
  const open = useAIChatStore((s) => s.open)
  const setOpen = useAIChatStore((s) => s.setOpen)
  // 天机 = 内置小 agent：打开即恢复上次会话（本地存档），不再每次清空
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
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
      const answer = await ask(q, messages)
      setMessages((m) => [...m, { role: 'ai', content: answer }])
    } finally {
      setBusy(false)
    }
  }

  /** 新对话：清空当前会话（连同本地存档），回到看板 */
  const newChat = () => {
    saveHistory([])
    setMessages([])
    setInput('')
  }

  /** 快捷能力：以「能力名 + 结果」的对话形式入流 */
  const runCap = async (key: TianjiCapabilityKey) => {
    if (busy) return
    const cap = TIANJI_CAPABILITIES.find((c) => c.key === key)
    if (!cap) return
    setMessages((m) => [...m, { role: 'user', content: `${cap.label}（天机一键运行）` }])
    setBusy(true)
    try {
      const { title, body } = await runTianjiCapability(key, stats)
      setMessages((m) => [...m, { role: 'ai', content: `【${title}】\n\n${body}` }])
    } catch {
      setMessages((m) => [...m, { role: 'ai', content: `${cap.label} 生成失败，请检查远程 AI 配置后重试。` }])
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
        {/* 头部 */}
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal/12 text-teal">
            <Bot size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="display text-sm font-semibold text-ink">天机</div>
            <div className="truncate text-[10px] text-ink-faint">
              {remoteReady ? '已接入远程 AI · 总掌全局，可问可点' : '未配置远程 AI · 当前仅本地规则概览'}
            </div>
          </div>
          <button
            onClick={newChat}
            aria-label="新对话"
            title="清空并开始新对话"
            className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="关闭天机"
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
              <p className="text-sm text-ink-muted">天机运转前，先告诉我你要什么——任务、课程、情报或收支都可以直接问。</p>
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
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-skill-indigo" />
              天机推演中…
            </div>
          )}
        </div>

        {/* 空会话：实时状态看板 + 能力 + 问句（管家形态） */}
        {messages.length === 0 && (
          <WelcomeBoard
            stats={stats}
            onPick={(q) => {
              setInput(q)
              void send(q)
            }}
            onRunCap={(key) => void runCap(key)}
          />
        )}

        {/* 输入 */}
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