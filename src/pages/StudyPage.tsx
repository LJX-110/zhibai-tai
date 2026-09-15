/**
 * 学 —— 番茄钟 / 课程 / 作业 / 考试
 */
import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Pencil,
  Eye,
} from 'lucide-react'
import { useCourseStore, useExamStore, useHomeworkStore } from '../stores/useStudyStore'
import { usePomodoroStore } from '../stores/usePomodoroStore'
import { usePomodoroTimerStore } from '../stores/usePomodoroTimerStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useTaskStore } from '../stores/useTaskStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useInspectorStore } from '../components/inspector/Inspector'
import { useResolvedLayout } from '../layouts/useResolvedLayout'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Section,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui'
import { Seal } from '../components/ui/Seal'
import { createId, friendlyDate, todayISO } from '../utils/id'
import {
  MAX_WEEKS,
  activeSlotsOfDay,
  buildWeeks,
  currentWeek,
  describeWeeks,
  slotsOverlap,
  type WeeksForm,
  type WeeksMode,
} from '../services/study'
import type { Course, Exam, Homework, PomodoroSession, WeeklySlot } from '../types/entities'
import { cn } from '../utils/cn'

/**
 * 课程名兜底：老数据或导入数据可能只有 room 而没填 name，
 * 显示层统一回退到地点，避免课表里出现一块只有时间的空白卡片。
 */
function courseLabel(c: Pick<Course, 'name' | 'room'>): string {
  return c.name?.trim() || c.room?.trim() || '未命名课程'
}

/**
 * 页签从 6 个收到 4 个：窄屏上六个页签必然横滚，靠后的两个（考试/统计）
 * 实际上等于「藏起来」。现在按「做什么」归组，功能一个没少：
 *  · 课程表 —— 含「管理课程」子视图（原「课程」页签）
 *  · 专注   —— 番茄钟 + 学习统计（原两个页签，同一件事的两面）
 *  · 作业 / 考试 —— 各自独立，本身就是高频动作
 */
const TABS: TabItem[] = [
  { key: 'timetable', label: '课程表' },
  { key: 'focus', label: '专注' },
  { key: 'homework', label: '作业' },
  { key: 'exam', label: '考试' },
]

export function StudyPage() {
  const [tab, setTab] = useState('timetable')
  /** 课程表页签内的子视图：表格 / 课程管理（原「课程」页签不再是独立页签） */
  const [managingCourses, setManagingCourses] = useState(false)
  /** 课表空格子快速加课：带上周几与一次性 nonce，切到课程管理并直接开编辑器 */
  const [quickAdd, setQuickAdd] = useState<{ weekday: number; nonce: number } | null>(null)
  const openQuickAdd = (weekday: number) => {
    setQuickAdd({ weekday, nonce: Date.now() })
    setManagingCourses(true)
  }
  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="学而时习之，不亦说乎" title="学 · 进境" />
      <Tabs
        items={TABS}
        active={tab}
        onChange={(k) => {
          setTab(k)
          // 离开课程表页签时复位子视图，回来看到的是课表本身而不是管理页
          if (k !== 'timetable') setManagingCourses(false)
        }}
        className="mb-4"
      />
      
      {tab === 'timetable' &&
        (managingCourses ? (
          <CourseTab quickAdd={quickAdd} onBack={() => setManagingCourses(false)} />
        ) : (
          <TimetableTab onGoCourse={() => setManagingCourses(true)} onQuickAdd={openQuickAdd} />
        ))}
      {tab === 'focus' && <PomodoroTab />}
      {tab === 'homework' && <HomeworkTab />}
      {tab === 'exam' && <ExamTab />}
    </div>
  )
}

/* ---------------- 课程表（Time Grid） ---------------- */

/** 固定时段（08:00–20:40） */
const SLOTS = [
  { key: '0800', label: '第 1 节', start: '08:00', end: '09:40' },
  { key: '1000', label: '第 2 节', start: '10:00', end: '11:40' },
  { key: '1400', label: '第 3 节', start: '14:00', end: '15:40' },
  { key: '1600', label: '第 4 节', start: '16:00', end: '17:40' },
  { key: '1900', label: '第 5 节', start: '19:00', end: '20:40' },
]

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六']

/** 常见大节的近似标注（时段自定义后仅作参考，匹配不到就不显示） */
function sectionLabelOf(start: string): string | undefined {
  return SLOTS.find((s) => s.start === start)?.label
}

/** 克制的课程识别色（浅底 + 强调字色 + 细边框） */
const COURSE_COLORS = [
  'bg-teal/10 text-teal border-teal/25',
  'bg-cinnabar/8 text-cinnabar border-cinnabar/20',
  'bg-bronze/14 text-bronze border-bronze/30',
  'bg-mist/50 text-ink-soft border-line-strong',
]

/** 课程左侧实色条（与 COURSE_COLORS 同哈希映射） */
const COURSE_BARS = [
  'bg-teal/60',
  'bg-cinnabar/60',
  'bg-bronze/60',
  'bg-ink-faint/50',
]

function colorFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COURSE_COLORS[h % COURSE_COLORS.length]
}

function barFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COURSE_BARS[h % COURSE_BARS.length]
}

function TimetableTab({
  onGoCourse,
  onQuickAdd,
}: {
  onGoCourse: () => void
  onQuickAdd: (weekday: number) => void
}) {
  const courses = useCourseStore((s) => s.items)
  const termStartDate = useSettingsStore((s) => s.termStartDate)
  const resolvedLayout = useResolvedLayout()
  const week = useMemo(() => currentWeek(termStartDate), [termStartDate])
  const today = new Date().getDay() // 0=周日
  // 移动端默认「日轴」（单日纵向清单，可左右翻日）；桌面默认「周景」
  const [mode, setMode] = useState<'day' | 'week' | 'list'>(
    resolvedLayout === 'mobile' ? 'day' : 'week',
  )
  /** 日轴当前查看的周几 */
  const [viewDay, setViewDay] = useState(today)
  /** 周景日列点击聚焦（null = 不聚焦；用于列头变绛红的持续态） */
  const [focusedDay, setFocusedDay] = useState<number | null>(null)

  const shiftDay = (delta: number) => setViewDay((d) => (d + delta + 7) % 7)

  // 当前查看日的课程（已按当前周次过滤）
  const dayCourses = useMemo(
    () => activeSlotsOfDay(courses, viewDay, week),
    [courses, viewDay, week],
  )

  const weeklyLoad = (wd: number) => activeSlotsOfDay(courses, wd, week).length

  return (
    <div>
      <div className="mb-3 space-y-2">
        {/* 标题行：只放标题与周次（学期起始日入口同样在此，未设置时显式露出） */}
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="scribal-title text-xl text-ink">课程表</h2>
          {week != null ? (
            <button
              type="button"
              onClick={() => setMode('week')}
              className="text-xs text-ink-faint transition-colors hover:text-ink"
              title="修改学期起始日"
            >
              第 {week} 周
            </button>
          ) : (
            /* 未设学期起始日就没法算周次：图标入口，点击弹出日期选择（不占标题行宽） */
            <label className="flex cursor-pointer items-center gap-1 text-xs text-cinnabar">
              设置首周
              <input
                type="date"
                value={termStartDate ?? ''}
                onChange={(e) =>
                  useSettingsStore.getState().set({ termStartDate: e.target.value || undefined })
                }
                className="h-5 w-0 cursor-pointer opacity-0"
                aria-label="设置学期首周周一"
              />
            </label>
          )}
        </div>
        {/* 操作行：视图切换 + 课程管理（与标题分行，手机上一行内不再塞四样控件） */}
        <div className="flex items-center gap-2">
          <div className="switch-pill flex gap-0.5 rounded-tile p-0.5">
            {(
              [
                ['day', '单日'],
                ['week', '周景'],
                ['list', '课程'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={cn(
                  'rounded-control px-3 py-1.5 text-sm transition-colors',
                  mode === k ? 'switch-pill-active' : 'text-ink-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 原「课程」页签的入口：功能还在，只是收进课程表里，省一个页签 */}
          <Button size="sm" variant="tertiary" onClick={onGoCourse} className="shrink-0">
            <Pencil size={13} /> 管理
          </Button>
        </div>
      </div>

      {mode === 'day' && (
        <div className="space-y-2">
          {/* 日轴翻页：单日纵向清单，左右换日 */}
          <div className="flex items-center justify-between rounded-tile border border-line bg-raised px-2 py-1.5">
            <button
              onClick={() => shiftDay(-1)}
              className="touch-target flex items-center justify-center rounded-control text-ink-muted hover:bg-nested hover:text-ink"
              aria-label="前一天"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="flex items-center gap-2">
              <span className="display text-base font-medium text-ink">{WEEKDAY_NAMES[viewDay]}</span>
              {viewDay === today && <span className="text-[11px] text-cinnabar">今天</span>}
              <span className="text-[11px] text-ink-faint">{weeklyLoad(viewDay)} 节</span>
            </div>
            <button
              onClick={() => shiftDay(1)}
              className="touch-target flex items-center justify-center rounded-control text-ink-muted hover:bg-nested hover:text-ink"
              aria-label="后一天"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          {dayCourses.length > 0 ? (
            dayCourses.map(({ course, slot }) => (
              <button
                key={`${course.id}-${slot.start}-${(slot.weeks ?? []).join('.')}`}
                onClick={() => useInspectorStore.getState().open('course', course.id)}
                className="flex w-full items-center gap-4 rounded-tile border border-line bg-paper/50 px-4 py-3 text-left transition-colors hover:border-line-strong"
              >
                <span className={cn('h-10 w-1.5 shrink-0 rounded-full', barFor(course.id))} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{courseLabel(course)}</div>
                  <div className="tabular mt-0.5 text-xs text-ink-muted">
                    {slot.start}–{slot.end}
                    {sectionLabelOf(slot.start) && (
                      <span className="ml-1.5 font-sans text-ink-faint">{sectionLabelOf(slot.start)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    {[course.room, course.teacher].filter(Boolean).join(' · ') || '—'}
                    {slot.weeks && slot.weeks.length > 0 && (
                      <span className="ml-1.5 text-bronze">· {describeWeeks(slot.weeks)}</span>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-paper border border-line">
              <EmptyState
                title={viewDay === today ? '今天没有排课' : `${WEEKDAY_NAMES[viewDay]}没有排课`}
                action={
                  <Button size="sm" variant="secondary" onClick={() => onQuickAdd(viewDay)}>
                    <Plus size={13} /> 在此日加课
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}

      {mode === 'week' && (
        <>
        {/* 桌面：立轴周景横滚（每日一根轴），移动端隐藏 */}
        <div className="scrollbar-thin hidden overflow-x-auto pb-1 sm:block">
          <div className="flex min-w-[660px] gap-2.5">
            {WEEKDAY_NAMES.map((name, wd) => {
              const isToday = wd === today
              const daySlots = activeSlotsOfDay(courses, wd, week)
              return (
                <div
                  key={wd}
                  className={cn(
                    'flex min-w-[86px] flex-1 flex-col rounded-tile border p-2 text-left transition-colors',
                    isToday
                      ? 'border-cinnabar/60 bg-cinnabar/[0.09]'
                      : focusedDay === wd
                        ? 'border-cinnabar/50 bg-cinnabar/[0.08]'
                        : 'border-teal/40 bg-teal/[0.08]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setFocusedDay((v) => (v === wd ? null : wd))}
                    className={cn(
                      'mb-2 text-center text-xs',
                      isToday || focusedDay === wd ? 'font-medium text-gold-btn' : 'text-ink-faint',
                    )}
                  >
                    {name}
                    {isToday && ' · 今'}
                  </button>
                  <div className="flex flex-1 flex-col items-center gap-2.5">
                    {daySlots.map(({ course, slot }) => (
                      <button
                        key={`${course.id}-${slot.start}-${(slot.weeks ?? []).join('.')}`}
                        onClick={() => useInspectorStore.getState().open('course', course.id)}
                        className={cn(
                          'flex w-full flex-col items-center gap-2 rounded-[16px] border px-1.5 py-3.5 transition-transform hover:-translate-y-px',
                          colorFor(course.id),
                        )}
                        title={`${slot.start}–${slot.end}${slot.weeks && slot.weeks.length > 0 ? ` · ${describeWeeks(slot.weeks)}` : ''}`}
                      >
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', barFor(course.id))} />
                        <span className="vertical-slip max-h-[110px] overflow-hidden text-[13px] font-medium leading-none">
                          {courseLabel(course)}
                        </span>
                        <span className="tabular text-[10px] opacity-75">{slot.start}</span>
                      </button>
                    ))}
                    {/* 空位即入口：在此日的格子里直接加课 */}
                    <button
                      onClick={() => onQuickAdd(wd)}
                      className="flex w-full flex-1 items-center justify-center rounded-[12px] border border-dashed border-line-strong/60 py-3 text-ink-faint transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
                      aria-label={`在 ${name} 加课`}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 移动端：横向滚动不友好，改为按月切换的每日排列表（默认今天居中导航） */}
        <div className="space-y-2 sm:hidden">
          {WEEKDAY_NAMES.map((name, wd) => {
            const isToday = wd === today
            const daySlots = activeSlotsOfDay(courses, wd, week)
            return (
              <div
                key={wd}
                className={cn(
                  'rounded-tile border p-3 transition-colors',
                  isToday || focusedDay === wd
                    ? 'border-cinnabar/50 bg-cinnabar/[0.07]'
                    : 'border-line bg-paper',
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setFocusedDay((v) => (v === wd ? null : wd))}
                    className={cn(
                      'text-sm',
                      isToday || focusedDay === wd ? 'font-medium text-gold-btn' : 'text-ink',
                    )}
                  >
                    {name}
                    {isToday && ' · 今'}
                  </button>
                  <button
                    onClick={() => onQuickAdd(wd)}
                    className="flex items-center gap-0.5 rounded-control bg-nested px-1.5 py-0.5 text-[11px] text-ink-faint transition-colors hover:text-cinnabar"
                    aria-label={`在 ${name} 加课`}
                  >
                    <Plus size={11} /> 加课
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {daySlots.length === 0 && (
                    <span className="text-[11px] text-ink-faint">无课</span>
                  )}
                  {daySlots.map(({ course, slot }) => (
                    <button
                      key={`${course.id}-${slot.start}-${(slot.weeks ?? []).join('.')}`}
                      onClick={() => useInspectorStore.getState().open('course', course.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-control border px-2 py-1 text-xs transition-colors',
                        colorFor(course.id),
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', barFor(course.id))} />
                      <span className="max-w-[9rem] truncate">{courseLabel(course)}</span>
                      <span className="tabular text-[10px] opacity-75">{slot.start}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        </>
      )}

      {mode === 'list' && (
        <div>
          {courses.length > 0 ? (
            courses.map((c) => (
              <div key={c.id} className="row">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', colorFor(c.id).split(' ')[0])} />
                <button
                  onClick={() => useInspectorStore.getState().open('course', c.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="text-sm font-medium text-ink">{courseLabel(c)}</span>
                  <span className="ml-2 text-xs text-ink-faint">{c.credit} 学分</span>
                </button>
                <span className="hidden text-xs text-ink-faint sm:inline">
                  {c.schedule?.length > 0
                    ? c.schedule
                        .map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.start}${s.weeks && s.weeks.length > 0 ? `（${describeWeeks(s.weeks)}）` : ''}`)
                        .join(' · ')
                    : '未排课'}
                </span>
              </div>
            ))
          ) : (
            <EmptyState title="还没有课程" action={<Button variant="primary" onClick={onGoCourse}><Plus size={14} /> 添加课程</Button>} />
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------- 番茄钟 ---------------- */

function PomodoroTab() {
  const sessions = usePomodoroStore((s) => s.items)
  const tasks = useTaskStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const projects = useProjectStore((s) => s.items)
  const focusMin = useSettingsStore((s) => s.pomodoroFocusMin)
  const breakMin = useSettingsStore((s) => s.pomodoroBreakMin)
  // 全局计时（学页 / Focus / 顶栏共用）
  const timer = usePomodoroTimerStore()
  const { mode, seconds, running, assoc, assocId } = timer
  const start = timer.start
  const pause = timer.pause
  const reset = timer.reset

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  const today = todayISO()
  const todaySessions = sessions
    .filter((s) => s.type === 'focus' && s.startAt.startsWith(today))
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
  const todayFocusMin = todaySessions.reduce((s, x) => s + x.durationMin, 0)

  const nameOf = (s: PomodoroSession) =>
    s.taskId
      ? tasks.find((t) => t.id === s.taskId)?.title
      : s.courseId
        ? courses.find((c) => c.id === s.courseId)?.name
        : s.projectId
          ? projects.find((p) => p.id === s.projectId)?.name
          : undefined

  const assocLabel = { none: '普通', task: '任务', course: '课程', project: '项目' }[assoc]

  return (
    <Section title="番茄钟" hint="专注计时 · 逐日统计">
      <div className="flex flex-col items-center gap-5 rounded-paper border border-line p-6 sm:flex-row sm:justify-between">
        <div className="text-center">
          <div className={cn('tabular display text-5xl font-semibold tabular-nums', mode === 'focus' ? 'text-ink' : 'text-ink-muted')}>
            {mm}:{ss}
          </div>
          <div className="mt-1 text-xs tracking-[0.3em] text-ink-faint">
            {mode === 'focus' ? '专注' : '休整'} · {mode === 'focus' ? focusMin : breakMin} 分钟
          </div>
          {/* 关联选择（仅专注开始前，紧凑双层选择替代 pill+下拉） */}
          {!running && mode === 'focus' && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Select
                value={assoc}
                onChange={(e) => timer.setAssoc(e.target.value as 'none' | 'task' | 'course' | 'project', '')}
                className="!w-auto !py-1 text-xs"
                aria-label="关联类型"
              >
                <option value="none">此段专注 · 无关联</option>
                <option value="task">关联任务</option>
                <option value="course">关联课程</option>
                <option value="project">关联项目</option>
              </Select>
              {assoc !== 'none' && (
                <Select
                  value={assocId}
                  onChange={(e) => timer.setAssoc(assoc, e.target.value)}
                  className="!w-auto !max-w-[140px] !py-1 text-xs"
                  aria-label="关联对象"
                >
                  <option value="">选择{assocLabel}</option>
                  {assoc === 'task' &&
                    tasks.filter((t) => !t.done).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  {assoc === 'course' &&
                    courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {assoc === 'project' &&
                    projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </div>
          )}
          <div className="mt-4 flex justify-center gap-2">
            {!running ? (
              <Button variant={mode === 'focus' ? 'primary' : 'secondary'} onClick={start}>
                <Play size={14} /> 开始
              </Button>
            ) : (
              <Button variant="secondary" onClick={pause}>
                <Pause size={14} /> 暂停
              </Button>
            )}
            <Button variant="tertiary" onClick={reset}>
              <RotateCcw size={14} /> 重置
            </Button>
          </div>
        </div>
        {/* 右栏：水平垂直双居中（此前窄屏塌成左上角） */}
        <div className="flex w-full max-w-[240px] flex-col items-center justify-center gap-0.5 text-center">
          <div className="text-ink-muted">今日专注</div>
          <div className="display text-3xl font-semibold text-cinnabar tabular">
            {todayFocusMin} <span className="text-sm font-normal text-ink-faint">分钟</span>
          </div>
          <div className="mt-1 text-xs text-ink-faint">
            {todaySessions.length} 段{assoc !== 'none' ? ` · 关联：${assocLabel}` : ''}
          </div>
        </div>
      </div>

      {/* 统计：今日/本周/本月/最长 */}
      <PomodoroStats sessions={sessions} />

      <div className="mt-5">
        {todaySessions.length > 0 ? (
          <div>
            {todaySessions.map((s) => (
              <div key={s.id} className="row">
                <span className="tabular text-xs text-ink-faint">
                  {new Date(s.startAt).toTimeString().slice(0, 5)}
                </span>
                <span className="flex-1 text-sm text-ink">
                  专注 {s.durationMin} 分钟
                  {nameOf(s) && <span className="ml-1.5 text-xs text-ink-muted">· {nameOf(s)}</span>}
                </span>
                <Badge tone="plain">{s.tags[0] ?? '专注'}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="今日尚无专注记录" desc="开始一段番茄钟吧" />
        )}
      </div>
    </Section>
  )
}

/** 番茄钟统计：今日 / 本周 / 本月 / 最长 —— 四个数字一张卡，别的交给天机 */
function PomodoroStats({ sessions }: { sessions: PomodoroSession[] }) {
  const today = todayISO()
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const mondayStart = new Date(monday).setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const focus = sessions.filter((s) => s.type === 'focus')
  const inRange = (t: number) => (s: PomodoroSession) => new Date(s.startAt).getTime() >= t

  const sum = (list: PomodoroSession[]) => list.reduce((a, s) => a + s.durationMin, 0)
  const day = focus.filter(inRange(new Date(`${today}T00:00:00`).getTime()))
  const week = focus.filter(inRange(mondayStart))
  const month = focus.filter(inRange(monthStart))
  const longest = Math.max(0, ...focus.map((s) => s.durationMin))

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MiniStat label="今日" value={`${sum(day)}`} unit="分钟" />
      <MiniStat label="本周" value={`${sum(week)}`} unit="分钟" />
      <MiniStat label="本月" value={`${sum(month)}`} unit="分钟" />
      <MiniStat label="最长" value={`${longest}`} unit="分钟" />
    </div>
  )
}

function MiniStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-paper bg-raised px-3 py-2">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className="mt-0.5">
        <span className="display tabular text-lg font-semibold text-ink">{value}</span>
        <span className="ml-1 text-[11px] text-ink-faint">{unit}</span>
      </div>
    </div>
  )
}

/* ---------------- 课程 ---------------- */

function CourseTab({
  quickAdd,
  onBack,
}: {
  quickAdd?: { weekday: number; nonce: number } | null
  /** 返回课程表（本视图现在是课表的子页，不是独立页签） */
  onBack: () => void
}) {
  const courses = useCourseStore((s) => s.items)
  const sessions = usePomodoroStore((s) => s.items)
  const toast = useToast().toast
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [form, setForm] = useState({
    name: '',
    teacher: '',
    room: '',
    credit: '0',
    note: '',
  })
  const [slots, setSlots] = useState<WeeklySlot[]>([])
  const [slotWeekday, setSlotWeekday] = useState('1')
  const [slotStart, setSlotStart] = useState('08:00')
  const [slotEnd, setSlotEnd] = useState('09:40')
  const [slotWeeks, setSlotWeeks] = useState<WeeksForm>({ mode: 'all', from: 1, to: 16, custom: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const openEditor = (c: Course | null, presetWeekday?: number) => {
    setEditing(c)
    setForm({
      name: c?.name ?? '',
      teacher: c?.teacher ?? '',
      room: c?.room ?? '',
      credit: String(c?.credit ?? 0),
      note: c?.note ?? '',
    })
    setSlots(c?.schedule?.map((s) => ({ ...s })) ?? [])
    // 从课表格子进来时，带一节该周几的默认时段：打开即可改，不用再点「加一节」
    if (!c && presetWeekday != null) {
      setSlots([{ weekday: presetWeekday, start: '08:00', end: '09:40' }])
      setSlotWeekday(String(presetWeekday))
    }
    setSlotWeeks({ mode: 'all', from: 1, to: 16, custom: '' })
    setOpen(true)
  }

  /** 课表空位 → 直接开新课程的编辑器，并预填该周几 */
  const [lastQuickNonce, setLastQuickNonce] = useState(0)
  if (quickAdd && quickAdd.nonce !== lastQuickNonce) {
    setLastQuickNonce(quickAdd.nonce)
    openEditor(null, quickAdd.weekday)
  }

  const save = async () => {
    if (!form.name.trim()) return
    await useCourseStore.getState().save({
      id: editing?.id ?? createId(),
      name: form.name.trim(),
      teacher: form.teacher.trim() || undefined,
      room: form.room.trim() || undefined,
      schedule: slots,
      credit: Number(form.credit) || 0,
      note: form.note.trim() || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setOpen(false)
  }

  const addSlot = () => {
    const start = slotStart || '08:00'
    const end = slotEnd || slotStart || '09:40'
    if (end <= start) {
      toast('结束时间要晚于开始时间', 'danger')
      return
    }
    const weeks = buildWeeks(slotWeeks)
    if (slotWeeks.mode === 'custom' && (!weeks || weeks.length === 0)) {
      toast('自定义周次没解析出有效周号（用逗号分隔，如 1,2,5）', 'danger')
      return
    }
    setSlots((s) => [...s, { weekday: Number(slotWeekday), start, end, weeks }])
  }

  /** 跨课程时段冲突：同一时段两门课，排课时就要看见，别等上课才发现 */
  const conflictHints = useMemo(() => {
    const out: string[] = []
    for (const other of courses) {
      if (other.id === editing?.id) continue
      for (const mine of slots) {
        for (const theirs of other.schedule ?? []) {
          if (slotsOverlap(mine, theirs)) {
            out.push(
              `${WEEKDAY_NAMES[mine.weekday]} ${mine.start}–${mine.end} 与「${other.name}」重叠`,
            )
          }
        }
      }
    }
    return [...new Set(out)].slice(0, 4)
  }, [courses, slots, editing?.id])

  /** 导出课表为 JSON（换设备、留底、改坏了能回滚） */
  const exportCourses = () => {
    const dump = {
      app: 'yishu-workbench',
      kind: 'courses',
      exportedAt: new Date().toISOString(),
      courses,
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zhibaitai-courses-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast(`已导出 ${courses.length} 门课程`, 'success')
  }

  /** 导入课表：同 id 覆盖、新 id 追加 */
  const importCourses = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const list = Array.isArray(parsed)
        ? parsed
        : ((parsed as { courses?: unknown }).courses ?? [])
      if (!Array.isArray(list) || list.length === 0) throw new Error('文件里没有课程数据')
      const now = new Date().toISOString()
      const incoming: Course[] = list
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
        .filter((c) => typeof c.name === 'string' && c.name.trim() !== '')
        .map((c) => ({
          id: typeof c.id === 'string' && c.id ? c.id : createId(),
          name: String(c.name).trim(),
          teacher: typeof c.teacher === 'string' ? c.teacher : undefined,
          room: typeof c.room === 'string' ? c.room : undefined,
          schedule: Array.isArray(c.schedule) ? (c.schedule as WeeklySlot[]) : [],
          credit: Number(c.credit) || 0,
          note: typeof c.note === 'string' ? c.note : undefined,
          createdAt: typeof c.createdAt === 'string' ? c.createdAt : now,
          updatedAt: now,
        }))
      if (incoming.length === 0) throw new Error('没有解析出有效课程（需含 name 字段）')
      await useCourseStore.getState().saveMany(incoming)
      toast(`已导入 ${incoming.length} 门课程`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '导入失败', 'danger')
    }
  }

  return (
    <Section
      title="课程管理"
      hint={`${courses.length} 门`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="tertiary" onClick={onBack}>
            <ChevronLeft size={13} /> 课程表
          </Button>
          <Button size="sm" variant="tertiary" onClick={exportCourses} disabled={courses.length === 0}>
            <Download size={13} /> 导出
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => fileRef.current?.click()}>
            <Plus size={13} /> 导入
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
            <Plus size={14} /> 课程
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importCourses(file)
            }}
          />
        </div>
      }
    >
      {courses.length > 0 ? (
        <div>
          {courses.map((c) => (
            <div key={c.id} className="row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{courseLabel(c)}</span>
                  <Badge tone="teal">{c.credit} 学分</Badge>
                  {(() => {
                    const mins = sessions
                      .filter((s) => s.type === 'focus' && s.courseId === c.id)
                      .reduce((a, s) => a + s.durationMin, 0)
                    return mins > 0 ? (
                      <span className="seal seal--active">累计学习 {mins} 分钟</span>
                    ) : null
                  })()}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                  {c.teacher && <span>师 · {c.teacher}</span>}
                  {c.room && <span>室 · {c.room}</span>}
                  {c.schedule?.map((sl, i) => (
                    <span key={i} className="tabular">
                      周{WEEKDAY_SHORT[sl.weekday]} {sl.start}–{sl.end}
                      {sl.weeks && sl.weeks.length > 0 && (
                        <span className="ml-1 text-bronze">{describeWeeks(sl.weeks)}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <button
                className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink"
                onClick={() => useInspectorStore.getState().open('course', c.id)}
                aria-label="详情"
              >
                <Eye size={14} />
              </button>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink" onClick={() => openEditor(c)} aria-label="编辑">
                <Pencil size={14} />
              </button>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => useCourseStore.getState().remove(c.id)} aria-label="删除">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="还没有课程" action={<Button variant="primary" onClick={() => openEditor(null)}><Plus size={14} /> 添加课程</Button>} />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? '改课程' : '新课程'}>
        <div className="space-y-3">
          <Input autoFocus placeholder="课程名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="教师" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} />
            <Input placeholder="教室" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          </div>
          <Input type="number" min={0} step={0.5} placeholder="学分" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />

          {/* 排课：周几 + 起止 + 周次（单双周靠它表达） */}
          <div>
            <div className="mb-1 text-xs text-ink-muted">排课</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(slotWeekday)} onChange={(e) => setSlotWeekday(e.target.value)} className="!w-auto !py-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                  <option key={w} value={String(w)}>周{WEEKDAY_SHORT[w]}</option>
                ))}
              </Select>
              <Input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className="!w-auto !py-1.5 text-sm" aria-label="开始时间" />
              <Input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className="!w-auto !py-1.5 text-sm" aria-label="结束时间" />
              <Button size="sm" variant="secondary" onClick={addSlot}>＋ 加一节</Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-ink-muted">周次</span>
              <div className="switch-pill flex gap-0.5 rounded-tile p-0.5">
                {(
                  [
                    ['all', '每周'],
                    ['odd', '单周'],
                    ['even', '双周'],
                    ['custom', '自定义'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setSlotWeeks((w) => ({ ...w, mode: k as WeeksMode }))}
                    className={cn(
                      'rounded-control px-2 py-1 text-xs transition-colors',
                      slotWeeks.mode === k ? 'switch-pill-active' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {slotWeeks.mode === 'odd' || slotWeeks.mode === 'even' ? (
                <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                  第
                  <input
                    type="number"
                    min={1}
                    max={MAX_WEEKS}
                    value={slotWeeks.from}
                    onChange={(e) => setSlotWeeks((w) => ({ ...w, from: Number(e.target.value) }))}
                    className="w-12 rounded-control border border-line bg-raised px-1 py-0.5 text-center text-xs text-ink"
                    aria-label="起始周"
                  />
                  –
                  <input
                    type="number"
                    min={1}
                    max={MAX_WEEKS}
                    value={slotWeeks.to}
                    onChange={(e) => setSlotWeeks((w) => ({ ...w, to: Number(e.target.value) }))}
                    className="w-12 rounded-control border border-line bg-raised px-1 py-0.5 text-center text-xs text-ink"
                    aria-label="结束周"
                  />
                  周
                </span>
              ) : slotWeeks.mode === 'custom' ? (
                <input
                  value={slotWeeks.custom}
                  onChange={(e) => setSlotWeeks((w) => ({ ...w, custom: e.target.value }))}
                  placeholder="1,2,5,8"
                  className="w-28 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink"
                  aria-label="自定义周次"
                />
              ) : null}
            </div>
            {slots.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {slots.map((s, i) => (
                  <span key={`${s.weekday}-${s.start}-${i}`} className="seal seal--active">
                    周{WEEKDAY_SHORT[s.weekday]} {s.start}
                    {s.weeks && s.weeks.length > 0 && ` · ${describeWeeks(s.weeks)}`}
                    <button onClick={() => setSlots((x) => x.filter((_, j) => j !== i))} className="ml-1 text-ink-faint hover:text-cinnabar">×</button>
                  </span>
                ))}
              </div>
            )}
            {conflictHints.length > 0 && (
              <div className="mt-2 space-y-1 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2">
                {conflictHints.map((h) => (
                  <div key={h} className="flex items-start gap-1.5 text-[11px] text-cinnabar">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {h}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Input placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>保存</Button>
        </div>
      </Dialog>
    </Section>
  )
}

/* ---------------- 作业 ---------------- */

function HomeworkTab() {
  const homeworks = useHomeworkStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Homework | null>(null)
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [dueDate, setDueDate] = useState('')

  const openEditor = (h: Homework | null) => {
    setEditing(h)
    setTitle(h?.title ?? '')
    setCourseId(h?.courseId ?? '')
    setDueDate(h?.dueDate ?? '')
    setOpen(true)
  }

  const save = async () => {
    if (!title.trim()) return
    await useHomeworkStore.getState().save({
      id: editing?.id ?? createId(),
      title: title.trim(),
      courseId: courseId || null,
      done: editing?.done ?? false,
      dueDate: dueDate || null,
      note: undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    })
    setOpen(false)
  }

  const toggle = async (h: Homework) => {
    await useHomeworkStore.getState().update(h.id, { done: !h.done })
  }

  const list = homeworks
    .slice()
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  return (
    <Section
      title="作业"
      hint={`${homeworks.filter((h) => !h.done).length} 未交`}
      action={
        <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
          <Plus size={14} /> 作业
        </Button>
      }
    >
      {list.length > 0 ? (
        <div>
          {list.map((h) => (
            <div key={h.id} className="row">
              {/* 作业完成 = 圆形符箓落印（与待办同语言） */}
              <button
                type="button"
                role="checkbox"
                aria-checked={h.done}
                onClick={() => toggle(h)}
                className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border transition-all duration-fast"
                title={h.done ? '标记未完成' : '标记完成'}
              >
                {h.done ? (
                  <Seal size={18} char="毕" tone="bronze" />
                ) : (
                  <span className="h-full w-full rounded-full border border-line-strong bg-raised transition-colors hover:border-cinnabar/50" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm', h.done ? 'text-ink-faint' : 'text-ink')}>{h.title}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
                  {courses.find((c) => c.id === h.courseId)?.name && (
                    <span>{courses.find((c) => c.id === h.courseId)?.name}</span>
                  )}
                  {h.dueDate && <span className="tabular">{friendlyDate(h.dueDate)}</span>}
                </div>
              </div>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => openEditor(h)} aria-label="编辑">
                <Pencil size={14} />
              </button>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => useHomeworkStore.getState().remove(h.id)} aria-label="删除">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="没有作业" action={<Button variant="primary" onClick={() => openEditor(null)}><Plus size={14} /> 添加作业</Button>} />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? '改作业' : '新作业'}>
        <div className="space-y-3">
          <Input autoFocus placeholder="作业内容" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">无关联课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>保存</Button>
        </div>
      </Dialog>
    </Section>
  )
}

/* ---------------- 考试 ---------------- */

function ExamTab() {
  const exams = useExamStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')

  const openEditor = (e: Exam | null) => {
    setEditing(e)
    setTitle(e?.title ?? '')
    setCourseId(e?.courseId ?? '')
    setDate(e?.date ?? todayISO())
    setTime(e?.time ?? '')
    setLocation(e?.location ?? '')
    setOpen(true)
  }

  const save = async () => {
    if (!title.trim()) return
    await useExamStore.getState().save({
      id: editing?.id ?? createId(),
      title: title.trim(),
      courseId: courseId || null,
      date,
      time: time || undefined,
      location: location.trim() || undefined,
      note: undefined,
    })
    setOpen(false)
  }

  const list = exams.slice().sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Section
      title="考试"
      hint={`${list.length} 场`}
      action={
        <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
          <Plus size={14} /> 考试
        </Button>
      }
    >
      {list.length > 0 ? (
        <div>
          {list.map((e) => (
            <div key={e.id} className="row">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-ink">{e.title}</span>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
                  {courses.find((c) => c.id === e.courseId)?.name && (
                    <span>{courses.find((c) => c.id === e.courseId)?.name}</span>
                  )}
                  <span className="tabular">{friendlyDate(e.date)}</span>
                  {e.time && <span className="tabular">{e.time}</span>}
                  {e.location && <span>{e.location}</span>}
                </div>
              </div>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => openEditor(e)} aria-label="编辑">
                <Pencil size={14} />
              </button>
              <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => useExamStore.getState().remove(e.id)} aria-label="删除">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="暂无考试" action={<Button variant="primary" onClick={() => openEditor(null)}><Plus size={14} /> 添加考试</Button>} />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? '改考试' : '新考试'}>
        <div className="space-y-3">
          <Input autoFocus placeholder="考试名称" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">无关联课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input placeholder="考场" value={location} onChange={(e) => setLocation(e.target.value)} />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>保存</Button>
        </div>
      </Dialog>
    </Section>
  )
}
