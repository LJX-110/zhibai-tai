/**
 * 学 · TimetableTab（从 StudyPage 拆出，见 docs/编码规范.md 路线图第 2 步）
 */
import { todayWeekday } from '../../utils/id'
import { useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarX,
  Pencil,
} from 'lucide-react'
import { useCourseCancellationStore, useCourseRescheduleStore, useCourseStore } from '../../stores/useStudyStore'

import { useSettingsStore } from '../../stores/useSettingsStore'
import { useInspectorStore } from '../../components/inspector/inspector-store'
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import { Button, EmptyState } from '../../components/ui'

import { activeSlotsOfDay, currentWeek, dateOfWeekday, daySlotsDetailed, describeWeeks } from '../../services/study'

import { cn } from '../../utils/cn'
import { AdjustClassDialog } from './AdjustClassDialog'
import { WeekView } from './WeekView'
import {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  barFor,
  courseLabel,
  sectionLabelOf,
} from './shared'

export function TimetableTab({
  onGoCourse,
  onQuickAdd,
}: {
  onGoCourse: () => void
  onQuickAdd: (weekday: number) => void
}) {
  const courses = useCourseStore((s) => s.items)
  // 停课 / 调课记录：课程表格子要显示「已停」「调至…」「调课」，
  // 并把日期换算成每一格对应的那一天
  const cancellations = useCourseCancellationStore((s) => s.items)
  const reschedules = useCourseRescheduleStore((s) => s.items)
  const termStartDate = useSettingsStore((s) => s.termStartDate)
  /** 首周入口：可见的 button 负责交互，input 只作原生日期选择器的宿主（见操作行注释） */
  const termStartRef = useRef<HTMLInputElement>(null)
  const resolvedLayout = useResolvedLayout()
  const week = useMemo(() => currentWeek(termStartDate), [termStartDate])
  const today = todayWeekday() // 0=周日
  // 移动端默认「日轴」（单日纵向清单，可左右翻日）；桌面默认「周景」
  const [mode, setMode] = useState<'day' | 'week' | 'list'>(
    resolvedLayout === 'mobile' ? 'day' : 'week',
  )
  /** 日轴当前查看的周几 */
  const [viewDay, setViewDay] = useState(today)
  /** 周景日列点击聚焦（null = 不聚焦；用于列头变绛红的持续态） */
  const [focusedDay, setFocusedDay] = useState<number | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const shiftDay = (delta: number) => setViewDay((d) => (d + delta + 7) % 7)

  // 当前查看日的课程（已按当前周次过滤）—— 带「已停 / 调走 / 调来」标记：
  // 不上与调走的课**要显示出来**（划掉+变淡），直接隐藏会让人以为课表丢了；
  // 调来的课**必须补进来**，否则用户只知道"那天那节没了"。
  const viewDate = dateOfWeekday(termStartDate, week, viewDay)
  const dayCourses = useMemo(
    () => daySlotsDetailed(courses, viewDay, week, viewDate, cancellations, reschedules),
    [courses, viewDay, week, viewDate, cancellations, reschedules],
  )

  // 节数按"实际要上"算：已停 / 已调走的不计入，调来的计入
  const weeklyLoad = (wd: number) =>
    activeSlotsOfDay(courses, wd, week, {
      date: dateOfWeekday(termStartDate, week, wd) ?? undefined,
      cancellations,
      reschedules,
    }).length

  return (
    <div>
      <AdjustClassDialog open={adjustOpen} onClose={() => setAdjustOpen(false)} />
      <div className="mb-3 space-y-2">
        {/* 标题行：与其他页 Section 标题同语言（sans + hint），不用书法体 —— 此前 scribal 让课程表标题字体与全站不一致 */}
        <div className="section-title">
          <span>
            <span className="text-base font-semibold text-ink">课程表</span>
            {week != null && (
              <span className="hint" title="点操作行里的「首周」可改学期起始周">
                第 {week} 周
              </span>
            )}
          </span>
        </div>
        {/* 操作行：设置首周 / 视图切换 / 课程管理（与标题分行，手机上一行内不再塞四样控件） */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 学期首周：常驻入口 + 显式触发原生选择器。
              不要写成「label 包一个铺满热区的透明 input」—— 点击会命中 input 本身，
              而 label 的激活行为又转发一次，date 的原生弹层会「弹开又被立刻关掉」，
              表现出来就是「点了没反应」（重复触发的一种）。这里让 button 与 input
              **互不重叠**，由 button 显式调 showPicker()，行为唯一、无歧义。 */}
          <button
            type="button"
            onClick={() => {
              const el = termStartRef.current
              if (!el) return
              // showPicker 必须在用户手势内调用（Chrome 99+ / Safari 16+ 支持）；
              // 老浏览器回退 click()，行为一致
              if (typeof el.showPicker === 'function') el.showPicker()
              else el.click()
            }}
            className="flex items-center rounded-control border border-line px-2 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            aria-label="设置学期起始周（首周周一）"
          >
            {termStartDate ? `首周 ${termStartDate.slice(5)}` : '设置首周'}
          </button>
          <input
            ref={termStartRef}
            type="date"
            value={termStartDate ?? ''}
            onChange={(e) =>
              useSettingsStore.getState().set({ termStartDate: e.target.value || undefined })
            }
            /* sr-only：视觉隐藏但**留在布局树里**（showPicker 要求元素可交互，
               不能用 hidden / display:none）。它与上面的 button 不重叠，
               所以既不会被误点，也不会造成双触发。 */
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
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
          {/* 「调课 / 停课」：改的是**某一次**课（不动排课），顺带解决"取消了/调走了还提醒" */}
          <Button size="sm" variant="tertiary" onClick={() => setAdjustOpen(true)} className="shrink-0">
            <CalendarX size={13} /> 调课 / 停课
          </Button>
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
              <span className="text-base font-medium text-ink">{WEEKDAY_NAMES[viewDay]}</span>
              {viewDay === today && <span className="text-xs text-cinnabar">今天</span>}
              <span className="text-xs text-ink-faint">{weeklyLoad(viewDay)} 节</span>
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
            dayCourses.map(({ course, slot, canceled, movedTo, movedIn }) => {
              /* 已停 与 已调走 是同一类"这天不上了"，视觉一致（变淡 + 中性条），
                 但文案必须分开写：停是"没了"，调是"改到别处上"，含糊会让人以为课丢了。 */
              const off = canceled || Boolean(movedTo)
              return (
              <button
                key={`${course.id}-${slot.start}-${(slot.weeks ?? []).join('.')}-${movedIn ? 'in' : ''}`}
                onClick={() => useInspectorStore.getState().open('course', course.id)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-tile border px-4 py-3 text-left transition-colors hover:border-line-strong',
                  off ? 'border-line bg-raised opacity-60' : 'border-line bg-paper/50',
                )}
              >
                <span className={cn('h-10 w-1.5 shrink-0 rounded-full', off ? 'bg-line-strong' : barFor(course.id))} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{courseLabel(course)}</div>
                  <div className="tabular mt-0.5 text-xs text-ink-muted">
                    {slot.start}–{slot.end}
                    {sectionLabelOf(slot.start) && (
                      <span className="ml-1.5 font-sans text-ink-faint">{sectionLabelOf(slot.start)}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-faint">
                    {[course.room, course.teacher].filter(Boolean).join(' · ') || '—'}
                    {slot.weeks && slot.weeks.length > 0 && (
                      <span className="ml-1.5 text-bronze">· {describeWeeks(slot.weeks)}</span>
                    )}
                  </div>
                </div>
                {/* 已停 / 已调走：划掉 + 明写状态 —— 只变淡不够，会被当成渲染故障；
                    调来的那节打「调课」，说明它本不排在这一天 */}
                {canceled && <span className="shrink-0 text-xs text-cinnabar">已停</span>}
                {!canceled && movedTo && (
                  <span className="shrink-0 text-xs text-bronze">
                    调至 {movedTo.toDate.slice(5)} {movedTo.toStart}
                  </span>
                )}
                {movedIn && <span className="shrink-0 text-xs text-teal">调课</span>}
              </button>
              )
            })
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
        <WeekView
          courses={courses}
          cancellations={cancellations}
          reschedules={reschedules}
          week={week}
          termStartDate={termStartDate}
          today={today}
          focusedDay={focusedDay}
          onFocusDay={(wd) => setFocusedDay((v) => (v === wd ? null : wd))}
          onQuickAdd={onQuickAdd}
        />
      )}

      {mode === 'list' && (
        <div>
          {courses.length > 0 ? (
            courses.map((c) => (
              <div key={c.id} className="row">
                {/* 图例色块改用实色（barFor）：原来取 colorFor 的 10% 淡底当色块，
                    在米白底上几乎看不出颜色，图例等于失效 */}
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', barFor(c.id))} />
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

