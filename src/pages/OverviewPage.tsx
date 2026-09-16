/**
 * 观 —— 知白台首页（今日炁象 + 今日案台）
 * 打开即知今天：四维状态（非堆数字）→ 今日任务/课程/到期 → 天机入口（简报/问答在天机）
 */
import { useMemo, useState } from 'react'
import { ArrowRight, Bell, CheckCircle2, Plus, Sparkles } from 'lucide-react'
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
import { useResolvedLayout } from '../layouts/useResolvedLayout'
import { TaskItem } from '../components/task/TaskItem'
import { TaskEditor } from '../components/task/TaskEditor'
import { Section, EmptyState, Timeline, Button, Sheet, Taiji, PageHeader } from '../components/ui'
import { formatHM, todayISO } from '../utils/id'
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

/** 四象节点（罗盘方位牌）；窄屏用 'block' 排进 2×2 网格，不再绝对定位互挤 */
function QuadNode({
  beast,
  char,
  dim,
  pos,
}: {
  beast: string
  char: string
  dim: QiDim
  pos: 'top' | 'bottom' | 'left' | 'right' | 'block'
}) {
  const color = DIM_COLOR[dim.tone]
  const posClass = {
    top: 'absolute left-1/2 top-0 w-[120px] -translate-x-1/2',
    bottom: 'absolute left-1/2 bottom-0 w-[120px] -translate-x-1/2',
    left: 'absolute left-0 top-1/2 w-[120px] -translate-y-1/2',
    right: 'absolute right-0 top-1/2 w-[120px] -translate-y-1/2',
    block: 'w-full',
  }[pos]
  return (
    <div className={cn('flex flex-col items-center gap-1 rounded-[8px] border border-line bg-paper/75 px-2 py-1.5', posClass)}>
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

/** 四象罗盘 —— 今日炁象（外环八卦固定 · 24 刻度缓转 · 四象方位牌 · 中央太极）
 *  窄屏收起刻度环与八卦环，四象牌改为太极下方 2×2 —— 罗盘不再独占一整屏，
 *  四块方位牌也不会在 375px 宽下互相压字。 */
function FourSymbolsCompass({ qiDims, gradeTitle }: { qiDims: QiDim[]; gradeTitle: string }) {
  const compact = useResolvedLayout() === 'mobile'
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
    <div>
      <div
        className={cn(
          'relative mx-auto aspect-square w-full select-none',
          compact ? 'max-w-[240px]' : 'max-w-[460px]',
        )}
      >
        <svg viewBox="0 0 360 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {/* 外环（鎏金骨架） */}
          <circle cx="180" cy="180" r="164" fill="none" stroke="var(--color-gold-btn)" strokeWidth="1.2" opacity="0.85" />
          <circle cx="180" cy="180" r="151" fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.5" strokeDasharray="2 5" opacity="0.55" />
          {/* 八卦环（固定，不随转；窄屏省略） */}
          {!compact &&
            TRIGRAMS.map((t, i) => {
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
          {/* 24 刻度（缓转，四正位朱砂强调，余者鎏金；窄屏省略） */}
          {!compact && (
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
          )}
          {/* 中环 */}
          <circle cx="180" cy="180" r="104" fill="none" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.6" />
          {/* 四向虚十字 */}
          <line x1="180" y1="44" x2="180" y2="316" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.4" strokeDasharray="3 5" />
          <line x1="44" y1="180" x2="316" y2="180" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.4" strokeDasharray="3 5" />
        </svg>
        {/* 中央太极：锚定 svg 真实圆心（180,180）。
            此前用 inset-0 容器居中包住"太极+文字"纵向堆叠，
            文字把太极顶离了圆心约 15px —— 现太极独占圆心，文字锚在其下 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Taiji size={compact ? 40 : 52} className="glow-bronze" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-[32px]">
          <div className="scribal-title text-lg text-ink">{gradeTitle}</div>
        </div>
        {!compact && (
          <>
            {/* 四象 */}
            <QuadNode pos="right" beast="青龙" char="东" dim={qiDims[0]} />
            <QuadNode pos="bottom" beast="朱雀" char="南" dim={qiDims[1]} />
            <QuadNode pos="left" beast="白虎" char="西" dim={qiDims[2]} />
            <QuadNode pos="top" beast="玄武" char="北" dim={qiDims[3]} />
          </>
        )}
      </div>
      {compact && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <QuadNode pos="block" beast="青龙" char="东" dim={qiDims[0]} />
          <QuadNode pos="block" beast="朱雀" char="南" dim={qiDims[1]} />
          <QuadNode pos="block" beast="白虎" char="西" dim={qiDims[2]} />
          <QuadNode pos="block" beast="玄武" char="北" dim={qiDims[3]} />
        </div>
      )}
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
      <div className="mt-3 rounded-tile border border-line bg-raised p-3">
        <div className="mb-1.5 text-[11px] text-ink-faint">近 4 周完成待办</div>
        <div className="space-y-1.5">
          {data.trend.map((t) => (
            <div key={t.label} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] text-ink-muted">{t.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-nested">
                <div
                  className="h-full rounded-full bg-gold-btn"
                  style={{ width: `${Math.min(100, (t.done / Math.max(1, ...data.trend.map((x) => x.done))) * 100)}%` }}
                />
              </div>
              <span className="tabular w-8 shrink-0 text-right text-[11px] text-ink-soft">{t.done}</span>
            </div>
          ))}
        </div>
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

  const now = new Date()
  const date = todayISO()
  // 当前时刻 HH:mm（每渲染实时计算；分钟级变化由使用处驱动重渲染）
  const nowHMStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // 今日待上课（按周几匹配课程表）：
  // 只保留「未开始或进行中」，已结束的课不再展示 —— 实测反馈早上上完的课刷新后仍在提示
  const todayWeekday = now.getDay()
  const todayClasses = useMemo(() => {
    return courses
      .flatMap((c) =>
        (c.schedule ?? [])
          .filter((s) => s.weekday === todayWeekday)
          .map((s) => ({
            name: c.name,
            room: c.room,
            teacher: c.teacher,
            start: s.start,
            end: s.end,
            // 进行中：开始时刻 ≤ 现在 < 结束时刻
            ongoing: s.start <= nowHMStr && nowHMStr < s.end,
          })),
      )
      .filter((s) => s.end > nowHMStr)
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [courses, todayWeekday, nowHMStr])

  // 今日轨迹：同一分钟内对同一记录的连续操作（连续点「斩三尸 +1」等）合并为一条带计数，
  // 否则连点几下首页时间轴就被同一条刷屏（前述截图里 1 分钟内出现 6 条 +1 即此问题）
  const toneOf = (t: string): 'cinnabar' | 'bronze' | 'teal' =>
    t === 'task' || t === 'finance' || t === 'collection' ? 'cinnabar' : t === 'pomodoro' || t === 'water' ? 'teal' : 'bronze'
  const track = useMemo(() => {
    const minute = (iso: string) => iso.slice(0, 16)
    const today = activities
      .filter((a) => a.timestamp.startsWith(date))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const groups = new Map<string, { first: (typeof today)[number]; count: number }>()
    for (const a of today) {
      const key = `${minute(a.timestamp)}|${a.entityType}|${a.entityId}|${a.title}`
      const g = groups.get(key)
      if (g) g.count++
      else groups.set(key, { first: a, count: 1 })
    }
    return [...groups.values()].slice(0, 10).map(({ first, count }) => ({
      id: first.id,
      time: formatHM(first.timestamp),
      title: first.title,
      detail: count > 1 ? `×${count}` : (first.metadata ?? ''),
      tone: toneOf(first.entityType),
    }))
  }, [activities, date])

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

  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      {/* 页头：与其他板块统一（书法大标题 + 引首诗句） */}
      <PageHeader poem={greeting(now.getHours())} title="观 · 观照" />

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
      <section className="relative overflow-hidden rounded-paper border border-line px-6 pb-4 pt-5">
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
        {/* 方位口诀：桌面用一句话收束罗盘；窄屏四象牌已带方位名，重复说明藏掉 */}
        <p className="mt-2 hidden text-center text-[11px] text-ink-faint md:block">
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
                    <span className="flex w-16 shrink-0 items-center gap-1">
                      <span className="tabular text-xs text-ink-faint">{c.start}</span>
                      {c.ongoing && <span className="text-[10px] text-cinnabar">上课中</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">{c.name?.trim() || c.room?.trim() || '课程'}</div>
                      <div className="truncate text-[11px] text-ink-faint">
                        {[c.room, c.teacher].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="今日课程已结束" desc="刷新后不再显示已上完的课" />
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
          hint={`${track.length} 条`}
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
