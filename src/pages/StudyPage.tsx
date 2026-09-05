/**
 * 学 —— 番茄钟 / 课程 / 作业 / 考试
 */
import { useMemo, useState } from 'react'
import { Pause, Play, Plus, RotateCcw, Trash2, Pencil, Eye } from 'lucide-react'
import { useCourseStore, useExamStore, useHomeworkStore } from '../stores/useStudyStore'
import { usePomodoroStore } from '../stores/usePomodoroStore'
import { usePomodoroTimerStore } from '../stores/usePomodoroTimerStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useTaskStore } from '../stores/useTaskStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useInspectorStore } from '../components/inspector/Inspector'
import { useResolvedLayout } from '../layouts/useResolvedLayout'
import { StudyAssistant } from '../components/study/StudyAssistant'
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
  type TabItem,
} from '../components/ui'
import { Seal } from '../components/ui/Seal'
import { createId, friendlyDate, todayISO } from '../utils/id'
import type { Course, Exam, Homework, PomodoroSession, Task } from '../types/entities'
import { cn } from '../utils/cn'

const TABS: TabItem[] = [
  { key: 'timetable', label: '课程表' },
  { key: 'pomo', label: '番茄钟' },
  { key: 'course', label: '课程' },
  { key: 'homework', label: '作业' },
  { key: 'exam', label: '考试' },
  { key: 'stats', label: '统计' },
]

export function StudyPage() {
  const [tab, setTab] = useState('timetable')
  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="学而时习之，不亦说乎" title="学 · 进境" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />
      <StudyAssistant />
      {tab === 'timetable' && <TimetableTab onGoCourse={() => setTab('course')} />}
      {tab === 'pomo' && <PomodoroTab />}
      {tab === 'course' && <CourseTab />}
      {tab === 'homework' && <HomeworkTab />}
      {tab === 'exam' && <ExamTab />}
      {tab === 'stats' && <StudyStatsTab />}
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

function TimetableTab({ onGoCourse }: { onGoCourse: () => void }) {
  const courses = useCourseStore((s) => s.items)
  const today = new Date().getDay() // 0=周日
  const resolvedLayout = useResolvedLayout()
  // 移动端默认「今天」，桌面默认「本周」
  const [mode, setMode] = useState<'today' | 'week' | 'list'>(
    resolvedLayout === 'mobile' ? 'today' : 'week',
  )

  // 今天课程（按时段排序）
  const todayCourses = courses
    .flatMap((c) =>
      (c.schedule ?? [])
        .filter((s) => s.weekday === today)
        .map((s) => ({ course: c, slot: s })),
    )
    .sort((a, b) => a.slot.start.localeCompare(b.slot.start))

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="scribal-title text-xl text-ink">课程表</h2>
            <span className="text-xs text-ink-faint">点击课程查看详情</span>
          </div>
        </div>
        <div className="flex gap-0.5 rounded-tile bg-raised p-0.5">
          {(
            [
              ['today', '今天'],
              ['week', '本周'],
              ['list', '课程'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={cn(
                'rounded-control px-3 py-1.5 text-sm transition-colors',
                mode === k ? 'bg-paper text-ink shadow-soft' : 'text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'today' && (
        <div className="space-y-2">
          {todayCourses.length > 0 ? (
            todayCourses.map(({ course, slot }) => (
              <button
                key={`${course.id}-${slot.start}`}
                onClick={() => useInspectorStore.getState().open('course', course.id)}
                className="flex w-full items-center gap-4 rounded-tile border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-line-strong"
              >
                <span className={cn('h-10 w-1.5 shrink-0 rounded-full', barFor(course.id))} />
                <div className="tabular w-20 shrink-0 text-[13px] text-ink-muted">
                  {slot.start}–{slot.end}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{course.name}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {[course.room, course.teacher, course.credit ? `${course.credit} 学分` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span className={cn('shrink-0 rounded-control border px-2 py-0.5 text-[11px]', colorFor(course.id))}>
                  {SLOTS.find((s) => s.start === slot.start)?.label ?? slot.start}
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-paper border border-line bg-panel/60">
              <EmptyState
                title="今天没有排课"
                desc="周末或休息日，可安排自主复习"
                step="在「课程」中添加周几 + 开始时间"
                action={
                  <Button size="sm" variant="secondary" onClick={onGoCourse}>
                    <Plus size={13} /> 添加课程
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}

      {mode === 'week' && (
        /* 立轴课表：每日一根轴，课程为垂挂轴签（B 方案） */
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-[660px] gap-2.5">
            {WEEKDAY_NAMES.map((name, wd) => {
              const isToday = wd === today
              const dayCourses = courses
                .flatMap((c) =>
                  (c.schedule ?? [])
                    .filter((sl) => sl.weekday === wd)
                    .map((sl) => ({ course: c, slot: sl })),
                )
                .sort((a, b) => a.slot.start.localeCompare(b.slot.start))
              return (
                <div
                  key={wd}
                  className={cn(
                    'flex min-w-[86px] flex-1 flex-col rounded-tile border p-2',
                    isToday ? 'border-gold-btn/60 bg-teal/[0.06]' : 'border-line bg-panel/50',
                  )}
                >
                  <div
                    className={cn(
                      'mb-2 text-center text-xs',
                      isToday ? 'font-medium text-gold-btn' : 'text-ink-faint',
                    )}
                  >
                    {name}
                    {isToday && ' · 今'}
                  </div>
                  <div className="flex flex-1 flex-col items-center gap-2.5">
                    {dayCourses.length > 0 ? (
                      dayCourses.map(({ course, slot }) => (
                        <button
                          key={`${course.id}-${slot.start}`}
                          onClick={() => useInspectorStore.getState().open('course', course.id)}
                          className={cn(
                            'flex w-full flex-col items-center gap-2 rounded-[16px] border px-1.5 py-3.5 transition-transform hover:-translate-y-px',
                            colorFor(course.id),
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', barFor(course.id))} />
                          <span className="vertical-slip max-h-[110px] overflow-hidden text-[13px] font-medium leading-none">
                            {course.name}
                          </span>
                          <span className="tabular text-[10px] opacity-75">{slot.start}</span>
                        </button>
                      ))
                    ) : (
                      <div className="flex flex-1 items-center justify-center py-3">
                        <span className="h-1 w-1 rounded-full bg-line-strong/50" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
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
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                  <span className="ml-2 text-xs text-ink-faint">{c.credit} 学分</span>
                </button>
                <span className="text-xs text-ink-faint">
                  {c.schedule?.length > 0
                    ? c.schedule?.map((s) => `${WEEKDAY_NAMES[s.weekday]} ${s.start}`).join(' · ')
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
    <Section title="番茄钟" hint="专注记录 Session，供道行「学」维计算">
      <div className="flex flex-col items-center gap-5 rounded-paper border border-line p-6 sm:flex-row sm:justify-between">
        <div className="text-center">
          <div className={cn('tabular display text-5xl font-semibold tabular-nums', mode === 'focus' ? 'text-ink' : 'text-ink-muted')}>
            {mm}:{ss}
          </div>
          <div className="mt-1 text-xs tracking-[0.3em] text-ink-faint">
            {mode === 'focus' ? '专注' : '休整'} · {mode === 'focus' ? focusMin : breakMin} 分钟
          </div>
          {/* 关联选择（仅专注开始前） */}
          {!running && mode === 'focus' && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <div className="flex gap-1 rounded-tile bg-nested/50 p-0.5">
                {(['none', 'task', 'course', 'project'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => timer.setAssoc(k, '')}
                    className={cn(
                      'rounded-control px-2 py-0.5 text-xs transition-colors',
                      assoc === k ? 'bg-paper text-ink' : 'text-ink-muted',
                    )}
                  >
                    {k === 'none' ? '普通' : k === 'task' ? '任务' : k === 'course' ? '课程' : '项目'}
                  </button>
                ))}
              </div>
              {assoc !== 'none' && (
                <Select
                  value={assocId}
                  onChange={(e) => timer.setAssoc(assoc, e.target.value)}
                  className="!w-auto !py-1 text-xs"
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
        <div className="w-full max-w-[240px] text-sm sm:text-right">
          <div className="text-ink-muted">今日专注</div>
          <div className="display text-3xl font-semibold text-cinnabar tabular">
            {todayFocusMin} <span className="text-sm font-normal text-ink-faint">分钟</span>
          </div>
          <div className="mt-1 text-xs text-ink-faint">
            {todaySessions.length} 段 · {assoc !== 'none' ? `本次关联：${assocLabel}` : '普通'}
          </div>
        </div>
      </div>

      {/* 统计：今日/本周/本月 + 分布 */}
      <PomodoroStats sessions={sessions} tasks={tasks} courses={courses} />

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

/** 番茄钟统计：今日/本周/本月 + 任务/课程分布 */
function PomodoroStats({
  sessions,
  tasks,
  courses,
}: {
  sessions: PomodoroSession[]
  tasks: Task[]
  courses: Course[]
}) {
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

  // 任务分布
  const taskDist = new Map<string, number>()
  for (const s of focus) {
    if (s.taskId) taskDist.set(s.taskId, (taskDist.get(s.taskId) ?? 0) + s.durationMin)
  }
  const courseDist = new Map<string, number>()
  for (const s of focus) {
    if (s.courseId) courseDist.set(s.courseId, (courseDist.get(s.courseId) ?? 0) + s.durationMin)
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MiniStat label="今日" value={`${sum(day)}`} unit="分钟" />
      <MiniStat label="本周" value={`${sum(week)}`} unit="分钟" />
      <MiniStat label="本月" value={`${sum(month)}`} unit="分钟" />
      <MiniStat label="最长" value={`${longest}`} unit="分钟" />
      <div className="col-span-2 rounded-paper bg-raised px-3 py-2">
        <div className="mb-1 text-[11px] text-ink-muted">任务分布</div>
        {taskDist.size > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {[...taskDist.entries()].slice(0, 4).map(([id, min]) => (
              <span key={id} className="seal seal--plain">
                {(tasks.find((t) => t.id === id)?.title ?? '任务').slice(0, 8)} · {min}m
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-ink-faint">暂无关联任务的专注</p>
        )}
      </div>
      <div className="col-span-2 rounded-paper bg-raised px-3 py-2">
        <div className="mb-1 text-[11px] text-ink-muted">课程分布</div>
        {courseDist.size > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {[...courseDist.entries()].slice(0, 4).map(([id, min]) => (
              <span key={id} className="seal seal--active">
                {(courses.find((c) => c.id === id)?.name ?? '课程').slice(0, 8)} · {min}m
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-ink-faint">暂无关联课程的专注</p>
        )}
      </div>
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

function CourseTab() {
  const courses = useCourseStore((s) => s.items)
  const sessions = usePomodoroStore((s) => s.items)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [form, setForm] = useState({
    name: '',
    teacher: '',
    room: '',
    credit: '0',
    note: '',
  })
  const [slots, setSlots] = useState<{ weekday: number; start: string; end: string }[]>([])
  const [slotWeekday, setSlotWeekday] = useState('1')
  const [slotStart, setSlotStart] = useState('08:00')
  const [slotEnd, setSlotEnd] = useState('09:40')

  const openEditor = (c: Course | null) => {
    setEditing(c)
    setForm({
      name: c?.name ?? '',
      teacher: c?.teacher ?? '',
      room: c?.room ?? '',
      credit: String(c?.credit ?? 0),
      note: c?.note ?? '',
    })
    setSlots(c?.schedule?.map((s) => ({ ...s })) ?? [])
    setOpen(true)
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
    })
    setOpen(false)
  }

  const addSlot = () => {
    // 自由时段：起止均可自定（此前锁死在 5 个固定大节）
    const start = slotStart || '08:00'
    const end = slotEnd || slotStart || '09:40'
    if (end <= start) return
    setSlots((s) => [...s, { weekday: Number(slotWeekday), start, end }])
  }

  return (
    <Section
      title="课程"
      hint={`${courses.length} 门`}
      action={
        <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
          <Plus size={14} /> 课程
        </Button>
      }
    >
      {courses.length > 0 ? (
        <div>
          {courses.map((c) => (
            <div key={c.id} className="row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{c.name}</span>
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
                      周{['日','一','二','三','四','五','六'][sl.weekday]} {sl.start}–{sl.end}
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

          {/* 排课 */}
          <div>
            <div className="mb-1 text-xs text-ink-muted">排课（周几 + 开始时间）</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(slotWeekday)} onChange={(e) => setSlotWeekday(e.target.value)} className="!w-auto !py-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                  <option key={w} value={String(w)}>周{['日', '一', '二', '三', '四', '五', '六'][w]}</option>
                ))}
              </Select>
              <Input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className="!w-auto !py-1.5 text-sm" aria-label="开始时间" />
              <Input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className="!w-auto !py-1.5 text-sm" aria-label="结束时间" />
              <Button size="sm" variant="secondary" onClick={addSlot}>＋ 加一节</Button>
            </div>
            {slots.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {slots.map((s, i) => (
                  <span key={i} className="seal seal--active">
                    周{['日', '一', '二', '三', '四', '五', '六'][s.weekday]} {s.start}
                    <button onClick={() => setSlots((x) => x.filter((_, j) => j !== i))} className="ml-1 text-ink-faint hover:text-cinnabar">×</button>
                  </span>
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

/* ---------------- 学习统计 ---------------- */

function StudyStatsTab() {
  const courses = useCourseStore((s) => s.items)
  const homeworks = useHomeworkStore((s) => s.items)
  const exams = useExamStore((s) => s.items)
  const sessions = usePomodoroStore((s) => s.items)
  const today = todayISO()

  const totalCredit = courses.reduce((s, c) => s + c.credit, 0)
  const todayFocus = sessions
    .filter((s) => s.type === 'focus' && s.startAt.startsWith(today))
    .reduce((s, x) => s + x.durationMin, 0)
  const undone = homeworks.filter((h) => !h.done).length

  // 本周专注（周一为起点）
  const weekFocus = useMemo(() => {
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const start = new Date(monday).setHours(0, 0, 0, 0)
    return sessions
      .filter((s) => s.type === 'focus' && new Date(s.startAt).getTime() >= start)
      .reduce((sum, s) => sum + s.durationMin, 0)
  }, [sessions])

  return (
    <Section title="学习统计">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBox label="总学分" value={`${totalCredit}`} unit="分" />
        <StatBox label="今日专注" value={`${todayFocus}`} unit="分钟" />
        <StatBox label="本周专注" value={`${weekFocus}`} unit="分钟" />
        <StatBox label="未交作业" value={`${undone}`} unit="项" />
      </div>

      <div className="mt-5">
        <div className="section-title text-sm">
          <span className="display">课程 · 学分</span>
          <span className="hint">{courses.length} 门</span>
        </div>
        {courses.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="py-2 pr-3 font-normal">课程</th>
                <th className="py-2 pr-3 font-normal">学分</th>
                <th className="py-2 pr-3 font-normal">排课</th>
                <th className="py-2 font-normal">未交作业</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-medium text-ink">{c.name}</td>
                  <td className="tabular py-2 pr-3 text-ink">{c.credit}</td>
                  <td className="py-2 pr-3 text-xs text-ink-muted">
                    {c.schedule?.length > 0
                      ? c.schedule?.map((s) => `周${['日','一','二','三','四','五','六'][s.weekday]}${s.start}`).join(' · ')
                      : '—'}
                  </td>
                  <td className="tabular py-2 text-ink">
                    {homeworks.filter((h) => h.courseId === c.id && !h.done).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="暂无课程" desc="添加课程后统计学分与排课" />
        )}
      </div>

      {exams.length > 0 && (
        <div className="mt-5">
          <div className="section-title text-sm">
            <span className="display">即将到来的考试</span>
          </div>
          <div>
            {exams
              .filter((e) => e.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5)
              .map((e) => (
                <div key={e.id} className="row">
                  <span className="tabular text-xs text-ink-faint">{friendlyDate(e.date)}</span>
                  <span className="flex-1 text-sm text-ink">{e.title}</span>
                  {courses.find((c) => c.id === e.courseId) && (
                    <Badge tone="plain">{courses.find((c) => c.id === e.courseId)?.name}</Badge>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </Section>
  )
}

function StatBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-paper bg-raised px-4 py-3">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className="mt-0.5">
        <span className="display tabular text-xl font-semibold text-ink">{value}</span>
        <span className="ml-1 text-xs text-ink-faint">{unit}</span>
      </div>
    </div>
  )
}
