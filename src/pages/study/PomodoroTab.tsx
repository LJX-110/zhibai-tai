/**
 * 学 · PomodoroTab（从 StudyPage 拆出，见 docs/编码规范.md 路线图第 2 步）
 */

import { Pause, Play, RotateCcw } from 'lucide-react'
import { useCourseStore } from '../../stores/useStudyStore'
import { usePomodoroStore } from '../../stores/usePomodoroStore'
import { usePomodoroTimerStore } from '../../stores/usePomodoroTimerStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useSettingsStore } from '../../stores/useSettingsStore'

import {
  Badge,
  Button,
  EmptyState,
  Select,
  Section,
} from '../../components/ui'

import { todayISO } from '../../utils/id'

import type { PomodoroSession } from '../../types/entities'
import { cn } from '../../utils/cn'

export function PomodoroTab() {
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
    <Section title="番茄钟">
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
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-0.5">
        <span className="display tabular text-lg font-semibold text-ink">{value}</span>
        <span className="ml-1 text-xs text-ink-faint">{unit}</span>
      </div>
    </div>
  )
}

/* ---------------- 课程 ---------------- */

