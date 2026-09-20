/**
 * 观 —— 知白台首页（今日炁象 + 今日案台）
 * 打开即知今天：四维状态（非堆数字）→ 今日任务/课程/到期 → 天机入口（简报/问答在天机）
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：罗盘 / 本周回顾 / 今日轨迹与「全部轨迹」抽屉
 * 各自成文件放在 ./overview/ 下；本文件只留状态、派生数据与区块组合。
 */
import { useMemo, useState } from 'react'
import { Bell, CheckCircle2, Plus, Sparkles } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { useIntelligenceStore } from '../stores/useIntelligenceStore'
import { useCourseStore } from '../stores/useStudyStore'
import { useActivityStore, useFollowStore } from '../stores/useLifeStores'
import { useTodayStats } from '../hooks/useTodayStats'
import { useCultivation } from '../hooks/useCultivation'
import { useTaskActions } from '../hooks/useTaskActions'
import { useInspectorStore } from '../components/inspector/Inspector'
import { TaskItem } from '../components/task/TaskItem'
import { TaskEditor } from '../components/task/TaskEditor'
import { Section, EmptyState, Button, PageHeader, Taiji } from '../components/ui'
import { formatHM, todayISO } from '../utils/id'
import type { Task } from '../types/entities'
import { FourSymbolsCompass } from './overview/Compass'
import { WeekReview } from './overview/WeekReview'
import { TodayTraceSection, AllTraceSheet } from './overview/Trace'
import type { QiDim } from './overview/shared'

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
  // 今日待上课（按周几匹配课程表）：courses 来自 useCourseStore，其 items 全程不可变更新
  // （stores/factory.ts 每次写都 set 新数组），courses 引用随数据变化而变；此处去掉手写 useMemo、
  // 改为普通派生值，交 React Compiler 按真实依赖自动记忆化，消除 preserve-manual-memoization 告警，
  // 行为与原 memo 等价
  const todayClasses = courses
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
      {/* 与其他板块一致用古文名句；此处取《道德经》十六章「万物并作，吾以观复」——
          "观复"正对「观 · 观照」，也比原先的动态问候语更合这一行的调性 */}
      <PageHeader poem="万物并作，吾以观复" title="观 · 观照" />

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
      <section className="relative overflow-hidden rounded-paper border border-line px-4 pb-4 pt-5 sm:px-6">
        {/* 卡头允许换行：窄屏上「今日炁象」与「等级 + 太极 + 关注更新」并排会超出，
            而外层是 overflow-hidden —— 超出的部分会被直接裁掉 */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-y-1">
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
                className="flex items-center gap-1.5 rounded-tile bg-cinnabar/10 px-2.5 py-1 text-xs text-cinnabar transition-colors hover:bg-cinnabar/15"
              >
                <Bell size={12} /> 关注更新 {followNotice}
              </button>
            )}
          </div>
        </div>
        <FourSymbolsCompass qiDims={qiDims} gradeTitle={grade.title} />
        {/* 方位口诀：桌面用一句话收束罗盘；窄屏四象牌已带方位名，重复说明藏掉 */}
        <p className="mt-2 hidden text-center text-xs text-ink-faint md:block">
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
                      {/* 字号例外：这一列是固定 w-16 的「时间 + 状态」同排，
                          「08:00」已占满大半，用 12px 会把「上课中」顶出固定宽并压到课名上 */}
                      {c.ongoing && <span className="text-[10px] text-cinnabar">上课中</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">{c.name?.trim() || c.room?.trim() || '课程'}</div>
                      <div className="truncate text-xs text-ink-faint">
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
        <TodayTraceSection track={track} onOpenAll={() => setAllTraceOpen(true)} />
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
      <AllTraceSheet open={allTraceOpen} onClose={() => setAllTraceOpen(false)} activities={activities} />
    </div>
  )
}
