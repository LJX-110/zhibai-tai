/**
 * 观 —— 知白台首页（今日炁象 + 今日案台 + AI 今日简报）
 * 打开即知今天：四维状态（非堆数字）→ 今日任务/课程/到期 → AI 一句话简报
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bell, CheckCircle2, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useAppStore } from '../stores/useAppStore'
import { useTaskStore } from '../stores/useTaskStore'
import { usePomodoroStore } from '../stores/usePomodoroStore'
import { useFinanceStore } from '../stores/useFinanceStore'
import { useHabitLogStore } from '../stores/useHabitStore'
import { useIntelligenceStore } from '../stores/useIntelligenceStore'
import { useCourseStore } from '../stores/useStudyStore'
import { useActivityStore, useFollowStore } from '../stores/useLifeStores'
import { useTodayStats } from '../hooks/useTodayStats'
import { useCultivation } from '../hooks/useCultivation'
import { useTaskActions } from '../hooks/useTaskActions'
import { useInspectorStore } from '../components/inspector/Inspector'
import { aiService } from '../services/ai/ai-service'
import { playSound } from '../services/sound'
import { TaskItem } from '../components/task/TaskItem'
import { TaskEditor } from '../components/task/TaskEditor'
import { Section, EmptyState, Timeline, Button, Sheet, Taiji } from '../components/ui'
import { formatHM, nowHM, todayISO, weekdayCN } from '../utils/id'
import { cn } from '../utils/cn'
import type { Task } from '../types/entities'

function greeting(hour: number): string {
  if (hour < 5) return '夜深了，注意休息'
  if (hour < 9) return '晨光初照，宜静心开卷'
  if (hour < 12) return '上午好，把握当下'
  if (hour < 14) return '午后小憩，气定神闲'
  if (hour < 18) return '下午好，继续推进'
  if (hour < 23) return '晚间好，收束今日'
  return '夜深了，注意休息'
}

/** 炁象维度（克制，非堆数字） */
interface QiDim {
  key: string
  label: string
  sub: string
  value: number
  max: number
  tone: 'teal' | 'cinnabar' | 'bronze' | 'plain'
}

const DIM_COLOR: Record<QiDim['tone'], string> = {
  cinnabar: 'var(--color-cinnabar)',
  teal: 'var(--color-teal)',
  bronze: 'var(--color-gold-btn)',
  plain: 'var(--color-ink-muted)',
}

/** 微型环形进度（四象节点） */
function RingGauge({ value, max, color, size = 40 }: { value: number; max: number; color: string; size?: number }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const p = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        style={{ transition: 'stroke-dasharray 600ms var(--ease-standard)' }}
      />
    </svg>
  )
}

/** 四象节点（罗盘方位牌） */
function QuadNode({ beast, char, dim, pos }: { beast: string; char: string; dim: QiDim; pos: 'top' | 'bottom' | 'left' | 'right' }) {
  const color = DIM_COLOR[dim.tone]
  const posClass = {
    top: 'left-1/2 top-0 -translate-x-1/2',
    bottom: 'left-1/2 bottom-0 -translate-x-1/2',
    left: 'left-0 top-1/2 -translate-y-1/2',
    right: 'right-0 top-1/2 -translate-y-1/2',
  }[pos]
  return (
    <div className={cn('absolute flex w-[120px] flex-col items-center gap-1 rounded-[8px] border border-line bg-panel/85 px-2 py-1.5', posClass)}>
      <span className="mono-meta text-[9px] text-ink-faint">
        {char} · {beast}
      </span>
      <div className="flex items-center gap-1.5">
        <RingGauge value={dim.value} max={dim.max} color={color} size={32} />
        <div className="flex flex-col items-start">
          <span className="scribal-title text-sm leading-none" style={{ color }}>
            {dim.label}
          </span>
          <span className="mt-0.5 text-[10px] leading-tight text-ink-muted">{dim.sub}</span>
        </div>
      </div>
    </div>
  )
}

/** 四象罗盘 —— 今日炁象（外环八卦固定 · 24 刻度缓转 · 四象方位牌 · 中央太极） */
function FourSymbolsCompass({ qiDims, gradeTitle }: { qiDims: QiDim[]; gradeTitle: string }) {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 * Math.PI) / 180
    const cardinal = i % 6 === 0
    const r1 = cardinal ? 176 : 164
    const r2 = cardinal ? 160 : 154
    return {
      x1: 180 + r1 * Math.cos(a),
      y1: 180 + r1 * Math.sin(a),
      x2: 180 + r2 * Math.cos(a),
      y2: 180 + r2 * Math.sin(a),
      cardinal,
    }
  })
  const TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷']
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px] select-none">
      <svg viewBox="0 0 360 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* 外环（鎏金骨架） */}
        <circle cx="180" cy="180" r="164" fill="none" stroke="var(--color-gold-btn)" strokeWidth="1.2" opacity="0.85" />
        <circle cx="180" cy="180" r="151" fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.5" strokeDasharray="2 5" opacity="0.55" />
        {/* 八卦环（固定，不随转） */}
        {TRIGRAMS.map((t, i) => {
          const a = ((i * 45 - 90) * Math.PI) / 180
          return (
            <text
              key={t}
              x={180 + 146 * Math.cos(a)}
              y={180 + 146 * Math.sin(a)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="10"
              fill="var(--color-gold-btn)"
              opacity="0.85"
            >
              {t}
            </text>
          )
        })}
        {/* 24 刻度（缓转，四正位朱砂强调，余者鎏金） */}
        <g className="compass-ring">
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.cardinal ? 'var(--color-cinnabar)' : 'var(--color-gold-btn)'}
              strokeWidth={t.cardinal ? 1 : 0.7}
              opacity={t.cardinal ? 0.85 : 0.65}
            />
          ))}
        </g>
        {/* 中环 */}
        <circle cx="180" cy="180" r="104" fill="none" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.6" />
        {/* 四向虚十字 */}
        <line x1="180" y1="44" x2="180" y2="316" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.4" strokeDasharray="3 5" />
        <line x1="44" y1="180" x2="316" y2="180" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.4" strokeDasharray="3 5" />
      </svg>
      {/* 中央太极 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-1.5">
          <Taiji size={52} className="glow-bronze" />
          <div className="scribal-title text-lg text-ink">{gradeTitle}</div>
        </div>
      </div>
      {/* 四象 */}
      <QuadNode pos="right" beast="青龙" char="东" dim={qiDims[0]} />
      <QuadNode pos="bottom" beast="朱雀" char="南" dim={qiDims[1]} />
      <QuadNode pos="left" beast="白虎" char="西" dim={qiDims[2]} />
      <QuadNode pos="top" beast="玄武" char="北" dim={qiDims[3]} />
    </div>
  )
}

/** 本周回顾 —— 数据看板（周一起算；克制四格 + 近 4 周完成趋势） */
function weekStart(weeksAgo = 0): Date {
  const d = new Date()
  const day = (d.getDay() + 6) % 7
  const s = new Date(d)
  s.setDate(d.getDate() - day - weeksAgo * 7)
  s.setHours(0, 0, 0, 0)
  return s
}

function WeekReview() {
  const tasks = useTaskStore((s) => s.items)
  const pomos = usePomodoroStore((s) => s.items)
  const finances = useFinanceStore((s) => s.items)
  const habitLogs = useHabitLogStore((s) => s.items)

  const data = useMemo(() => {
    const ws = weekStart()
    const we = new Date(ws.getTime() + 7 * 864e5)
    const inRange = (iso: string | undefined, from: Date, to: Date) => {
      if (!iso) return false
      const t = new Date(iso).getTime()
      return t >= from.getTime() && t < to.getTime()
    }
    const doneThisWeek = tasks.filter((t) => t.done && inRange(t.updatedAt, ws, we)).length
    const focusMin = pomos
      .filter((p) => inRange(p.startAt, ws, we))
      .reduce((s, p) => s + p.durationMin, 0)
    const month = todayISO().slice(0, 7)
    const income = finances
      .filter((f) => f.kind === 'income' && f.date.startsWith(month))
      .reduce((s, f) => s + f.amount, 0)
    const expense = finances
      .filter((f) => f.kind === 'expense' && f.date.startsWith(month))
      .reduce((s, f) => s + f.amount, 0)
    const habitDays = new Set(
      habitLogs.filter((h) => inRange(h.date, ws, we)).map((h) => h.date),
    ).size
    const trend = [3, 2, 1, 0].map((i) => {
      const from = weekStart(i)
      const to = new Date(from.getTime() + 7 * 864e5)
      return {
        label: i === 0 ? '本周' : `${from.getMonth() + 1}/${from.getDate()}`,
        done: tasks.filter((t) => t.done && inRange(t.updatedAt, from, to)).length,
      }
    })
    return { doneThisWeek, focusMin, income, expense, habitDays, trend }
  }, [tasks, pomos, finances, habitLogs])

  const cells = [
    { label: '待办完成', value: `${data.doneThisWeek}`, unit: '件', tone: 'text-teal' },
    { label: '专注时长', value: `${data.focusMin}`, unit: '分钟', tone: 'text-cinnabar' },
    {
      label: '本月结余',
      value: `${data.income - data.expense >= 0 ? '+' : ''}${data.income - data.expense}`,
      unit: '元',
      tone: data.income - data.expense >= 0 ? 'text-teal' : 'text-cinnabar',
    },
    { label: '斩三尸打卡', value: `${data.habitDays}`, unit: '天', tone: 'text-bronze' },
  ]

  return (
    <Section title="本周回顾" hint="周一为始 · 数据即所得">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-paper bg-raised px-3 py-3">
            <div className="text-[11px] text-ink-muted">{c.label}</div>
            <div className={cn('tabular mt-0.5 text-lg font-semibold', c.tone)}>
              {c.value}
              <span className="ml-1 text-[11px] font-normal text-ink-faint">{c.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 h-36 rounded-tile border border-line bg-raised p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }}
              axisLine={{ stroke: 'var(--color-line)' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-paper)',
                border: '1px solid var(--color-line-strong)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="done" name="完成待办" fill="var(--color-gold-btn)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  )
}

export function OverviewPage() {
  const stats = useTodayStats()
  const { grade } = useCultivation()
  const taskActions = useTaskActions()
  const setSection = useAppStore((s) => s.setSection)
  const intelItems = useIntelligenceStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const activities = useActivityStore((s) => s.items)
  const follows = useFollowStore((s) => s.items)
  const [editing, setEditing] = useState<Task | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [allTraceOpen, setAllTraceOpen] = useState(false)
  const [brief, setBrief] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)

  const now = new Date()
  const date = todayISO()

  // 今日课程（按周几匹配课程表）
  const todayWeekday = now.getDay()
  const todayClasses = useMemo(() => {
    return courses
      .flatMap((c) =>
        (c.schedule ?? [])
          .filter((s) => s.weekday === todayWeekday)
          .map((s) => ({ name: c.name, room: c.room, teacher: c.teacher, start: s.start, end: s.end })),
      )
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [courses, todayWeekday])

  // 今日轨迹
  const todayActivities = activities
    .filter((a) => a.timestamp.startsWith(date))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  const toneOf = (t: string): 'cinnabar' | 'bronze' | 'teal' =>
    t === 'task' || t === 'finance' || t === 'collection' ? 'cinnabar' : t === 'pomodoro' || t === 'water' ? 'teal' : 'bronze'
  const track = todayActivities.slice(0, 10).map((a) => ({
    id: a.id,
    time: formatHM(a.timestamp),
    title: a.title,
    detail: a.metadata ?? '',
    tone: toneOf(a.entityType),
  }))

  // 关注更新提示
  const followNotice = useMemo(() => {
    if (follows.length === 0) return 0
    const unread = intelItems.filter((it) => !it.read)
    if (unread.length === 0) return 0
    return follows.filter((f) =>
      unread.some(
        (it) =>
          (it.tags ?? []).some((t) => t.toLowerCase().includes(f.keyword.toLowerCase())) ||
          (it.category ?? '').toLowerCase().includes(f.keyword.toLowerCase()) ||
          (it.source ?? '').toLowerCase().includes(f.keyword.toLowerCase()) ||
          it.title.toLowerCase().includes(f.keyword.toLowerCase()),
      ),
    ).length
  }, [follows, intelItems])

  const urgent = [...stats.todayDue, ...stats.upcoming].slice(0, 5)

  // 下一件事：今天下一节课 / 最近到期任务（打开首页即获行动指令）
  const nowHMStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const nextClass = todayClasses.find((c) => c.start > nowHMStr)
  const nextDue = stats.todayDue[0]

  // 四维炁象
  const qiDims: QiDim[] = useMemo(() => {
    const todayFocus = stats.focusMinutes
    return [
      { key: 'act', label: '行动', sub: stats.tasksDone > 0 ? `已办 ${stats.tasksDone} 事` : '今日尚未动笔', value: Math.min(stats.tasksDone, 5), max: 5, tone: 'cinnabar' },
      { key: 'focus', label: '专注', sub: todayFocus > 0 ? `已专注 ${todayFocus} 分钟` : '尚未开始专注', value: Math.min(todayFocus / 20, 5), max: 5, tone: 'teal' },
      { key: 'study', label: '学习', sub: todayClasses.length > 0 ? `今日 ${todayClasses.length} 节课` : '今日无课', value: Math.min(todayClasses.length, 5), max: 5, tone: 'teal' },
      { key: 'create', label: '创造', sub: stats.creations > 0 ? `已录 ${stats.creations} 条` : '尚无新灵感', value: Math.min(stats.creations, 5), max: 5, tone: 'bronze' },
    ]
  }, [stats, todayClasses])

  // AI 今日简报（一句话）
  const loadBrief = async () => {
    setBriefLoading(true)
    try {
      const b = await aiService.overviewBrief({
        tasksToday: stats.highPriorityOpen.length + stats.todayDue.length,
        classesToday: todayClasses.length,
        dueSoon: urgent.length,
        focusMin: stats.focusMinutes,
      })
      setBrief(b)
    } finally {
      setBriefLoading(false)
    }
  }
  useEffect(() => {
    void loadBrief()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      {/* 页头：问候 + 日期 */}
      <div className="pb-6">
        <p className="mono-meta text-ink-faint">
          {date} · 周{weekdayCN(now.getDay())} · <span className="tabular">{nowHM()}</span>
        </p>
        <h1 className="scribal-title mt-1 text-3xl text-ink-bright">
          {greeting(now.getHours())}
        </h1>
        <div className="mt-1.5 flex items-center gap-3">
          <p className="scribal text-base text-ink-muted">道法自然，观照当下</p>
          {/* 快捷键常驻提示：命令面板不做引导几乎无人发现；点击直接呼出 */}
          <button
            onClick={() =>
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }))
            }
            className="flex items-center gap-1.5 rounded-control border border-line bg-raised px-2 py-0.5 text-[11px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink"
            title="呼出命令面板"
          >
            <kbd className="font-mono">Ctrl K</kbd> 命令面板
          </button>
        </div>
      </div>

      {/* 下一件事：时序感的第一入口 */}
      {(nextClass || nextDue) && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-line bg-raised px-3.5 py-2 text-sm">
          <span className="mono-meta text-ink-faint">下一件事</span>
          {nextClass ? (
            <span className="text-ink">
              <span className="tabular font-medium text-cinnabar">{nextClass.start}</span>
              {' '}
              {nextClass.name}
              {nextClass.room ? <span className="text-ink-muted"> · {nextClass.room}</span> : null}
            </span>
          ) : (
            <span className="text-ink-faint">今日课程已结束</span>
          )}
          {nextDue && (
            <button
              onClick={() => useInspectorStore.getState().open('task', nextDue.id)}
              className="min-w-0 truncate text-left text-ink-muted transition-colors hover:text-ink"
              title="查看详情"
            >
              · 最近到期：<span className="text-ink">{nextDue.title.slice(0, 20)}</span>
              {nextDue.dueDate && <span className="tabular text-ink-faint">（{nextDue.dueDate}）</span>}
            </button>
          )}
        </div>
      )}

      {/* 今日炁象：四象罗盘 */}
      <section className="relative overflow-hidden rounded-paper border border-line bg-panel px-6 py-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 mono-meta text-ink-faint">
            <Sparkles size={13} className="text-bronze" />
            今日炁象 · QI COMPASS
          </div>
          <div className="flex items-center gap-2">
            <span className="scribal text-base text-cinnabar">{grade.title}</span>
            <Taiji size={18} className="opacity-85" />
            {followNotice > 0 && (
              <button
                onClick={() => setSection('intelligence')}
                className="flex items-center gap-1.5 rounded-[6px] bg-cinnabar/10 px-2.5 py-1 text-xs text-cinnabar transition-colors hover:bg-cinnabar/15"
              >
                <Bell size={12} /> 关注更新 {followNotice}
              </button>
            )}
          </div>
        </div>
        <FourSymbolsCompass qiDims={qiDims} gradeTitle={grade.title} />
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          东·行 · 南·专 · 西·学 · 北·创 —— 五行流转，今日炁象
        </p>
      </section>

      {/* 今日案台：任务 / 课程 / 到期 */}
      <div className="mt-2 grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Section
            title="今日任务"
            hint={`${stats.highPriorityOpen.length} 件重点`}
            action={
              <Button size="sm" variant="tertiary" onClick={() => setEditorOpen(true)}>
                <Plus size={14} /> 添加
              </Button>
            }
          >
            {stats.highPriorityOpen.length > 0 ? (
              <div>
                {stats.highPriorityOpen.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    onToggle={taskActions.toggle}
                    onEdit={(task) => {
                      setEditing(task)
                      setEditorOpen(true)
                    }}
                    onDelete={taskActions.remove}
                    highlight
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="今日无重点待办"
                desc="没有重大事项压顶，可从容布局"
                step="去「行」添加今天的重点"
                action={
                  <Button size="sm" variant="secondary" onClick={() => setSection('action')}>
                    前往「行」
                  </Button>
                }
              />
            )}
          </Section>
        </div>

        <div className="lg:col-span-4">
          <Section title="今日课程" hint={`${todayClasses.length} 节`}>
            {todayClasses.length > 0 ? (
              <div>
                {todayClasses.map((c, i) => (
                  <div key={i} className="row">
                    <span className="tabular w-16 shrink-0 text-xs text-ink-faint">{c.start}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">{c.name}</div>
                      <div className="truncate text-[11px] text-ink-faint">
                        {[c.room, c.teacher].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="今日无课" desc="周末或休息，可安排自主复习" />
            )}
          </Section>

          <Section title="到期提醒" hint="含逾期与未来 3 天">
            {urgent.length > 0 ? (
              <div>
                {urgent.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    onToggle={taskActions.toggle}
                    onEdit={(task) => {
                      setEditing(task)
                      setEditorOpen(true)
                    }}
                    onDelete={taskActions.remove}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="暂无临近事项" desc="近三天没有到期安排" />
            )}
          </Section>
        </div>
      </div>

      {/* 本周回顾（数据看板） */}
      <div className="mt-2">
        <WeekReview />
      </div>

      {/* 今日轨迹 */}
      <div className="mt-2">
        <Section
          title="今日轨迹"
          hint={`${todayActivities.length} 条`}
          action={
            <Button size="sm" variant="tertiary" onClick={() => setAllTraceOpen(true)}>
              全部 <ArrowRight size={13} />
            </Button>
          }
        >
          {track.length > 0 ? (
            <Timeline items={track} />
          ) : (
            <EmptyState
              title="今日尚无轨迹"
              desc="完成待办、专注、记录或收藏后会自动出现在这里"
              step="先做一件事，轨迹自会浮现"
            />
          )}
        </Section>
      </div>

      {/* AI 今日简报 */}
      <section className="mt-2 rounded-paper border border-line bg-panel px-6 py-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 mono-meta text-teal">
            <Sparkles size={13} /> AI 今日简报 · BRIEF
          </div>
          <button
            onClick={() => {
              playSound('ui-click')
              void loadBrief()
            }}
            disabled={briefLoading}
            className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs text-teal transition-colors hover:bg-teal/10 disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(briefLoading && 'animate-spin')} /> 重新生成
          </button>
        </div>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {briefLoading ? '正在梳理今日…' : brief || '正在生成今日简报…'}
        </p>
      </section>

      <TaskEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        task={editing}
        onSave={taskActions.save}
      />

      {/* 全部轨迹 Sheet */}
      <Sheet open={allTraceOpen} onClose={() => setAllTraceOpen(false)} title="个人轨迹">
        {activities.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto">
            {[...activities]
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .slice(0, 60)
              .map((a) => (
                <div key={a.id} className="row">
                  <span className="tabular w-12 shrink-0 text-xs text-ink-faint">{formatHM(a.timestamp)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.title}</span>
                  {a.metadata && <span className="truncate text-xs text-ink-faint">{a.metadata}</span>}
                </div>
              ))}
          </div>
        ) : (
          <EmptyState title="还没有轨迹" desc="使用待办、番茄钟、喝水、收藏等会自动记录" />
        )}
      </Sheet>
    </div>
  )
}
