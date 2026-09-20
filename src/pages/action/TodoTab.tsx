/**
 * 行 · 待办页签 —— 今日快捷添加 + 未完成清单 + 每月/每周固定提醒
 * （合并原「今日」页签）
 */
import { useState } from 'react'
import { CalendarDays, CheckCircle2, Plus, Search } from 'lucide-react'
import { useTaskStore } from '../../stores/useTaskStore'
import { useTaskActions } from '../../hooks/useTaskActions'
import { TaskItem } from '../../components/task/TaskItem'
import { TaskEditor } from '../../components/task/TaskEditor'
import { Button, Input, Section } from '../../components/ui'
import { createId, diffDays, monthlyDoneThisMonth, monthlyDueToday, weeklyDoneThisWeek, weeklyDueToday, todayISO, nowISO } from '../../utils/id'
import type { Task } from '../../types/entities'
import { useTaskEditor } from './useTaskEditor'

export function TodoTab() {
  const tasks = useTaskStore((s) => s.items)
  const actions = useTaskActions()
  const editor = useTaskEditor()
  const [query, setQuery] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [showMonthly, setShowMonthly] = useState(false)
  const [showWeekly, setShowWeekly] = useState(false)
  const [quick, setQuick] = useState('')
  const today = todayISO()

  const quickAdd = async () => {
    if (!quick.trim()) return
    const now = nowISO()
    await useTaskStore.getState().add({
      id: createId(),
      title: quick.trim(),
      description: undefined,
      done: false,
      priority: 'mid',
      dueDate: today,
      tags: [],
      repeat: 'none',
      monthlyDay: null,
      weeklyDay: null,
      projectId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    setQuick('')
  }

  const q = query.trim().toLowerCase()
  const match = (t: Task) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    t.tags.some((tg) => tg.toLowerCase().includes(q)) ||
    (t.dueDate ?? '').includes(q)

  // 未完成：普通任务（非每月/每周固定）按日期排序
  const open = tasks
    .filter((t) => !t.done && t.monthlyDay == null && t.weeklyDay == null && match(t))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  // 每月固定：本月未完成，按 N 号排序（作为提醒展示）
  const monthly = tasks
    .filter((t) => t.monthlyDay != null && !monthlyDoneThisMonth(t) && match(t))
    .sort((a, b) => (a.monthlyDay ?? 31) - (b.monthlyDay ?? 31))

  // 每周固定：本周未完成，按 周日→周六 排序（与每月固定同一呈现位置）
  const weekly = tasks
    .filter((t) => t.weeklyDay != null && !weeklyDoneThisWeek(t) && match(t))
    .sort((a, b) => (a.weeklyDay ?? 6) - (b.weeklyDay ?? 6))

  const done = tasks
    .filter((t) => t.done && match(t))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const overdueCount = open.filter((t) => t.dueDate && diffDays(t.dueDate) < 0).length
  const todayMonthly = monthly.filter((t) => monthlyDueToday(t))
  const todayWeekly = weekly.filter((t) => weeklyDueToday(t))

  return (
    <Section
      title="待办"
      hint={`未完成 ${open.length} · 已完成 ${done.length}`}
      action={
        <Button size="sm" variant="tertiary" onClick={editor.openNew}>
          <Plus size={14} /> 添加
        </Button>
      }
    >
      <div className="mb-3 flex gap-2">
        <Input
          placeholder="快速记一条待办，回车即加…"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
        />
        <Button variant="primary" onClick={quickAdd} disabled={!quick.trim()}>
          <Plus size={14} />
        </Button>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="搜索任务 / 标签 / 日期…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="!pl-8"
        />
      </div>

      {/* 今日固定提醒 */}
      {todayMonthly.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2">
          <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-cinnabar" />
          {/* 中间文字 flex-1 min-w-0：窄屏多条约会时给文字留出换行余地，
              否则它按内容撑宽、把右侧「每月提醒」挤出卡片 */}
          <span className="min-w-0 flex-1 text-sm text-ink">
            今日固定 · {todayMonthly.map((t) => t.title).join('、')}
          </span>
          <span className="mono-meta ml-auto shrink-0 text-cinnabar">每月提醒</span>
        </div>
      )}
      {todayWeekly.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2">
          <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-cinnabar" />
          <span className="min-w-0 flex-1 text-sm text-ink">
            今日固定 · {todayWeekly.map((t) => t.title).join('、')}
          </span>
          <span className="mono-meta ml-auto shrink-0 text-cinnabar">每周提醒</span>
        </div>
      )}
      {overdueCount > 0 && (
        <div className="mb-3 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2 text-sm text-cinnabar">
          有 {overdueCount} 项已逾期，先处理它们
        </div>
      )}

      {/* 未完成清单（标题已在 Section 头，不再重复内嵌标题） */}
      {open.length > 0 ? (
        <div>
          {open.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggle={actions.toggle}
              onEdit={editor.openEdit}
              onDelete={actions.remove}
            />
          ))}
        </div>
      ) : (
        <p className="py-3 text-xs text-ink-faint">今日暂无待办，可点右上「添加」</p>
      )}

      {/* 每月固定提醒（次级：折叠展开，不占主列表视觉权重） */}
      {monthly.length > 0 && (
        <div className="mt-6 border-t border-line pt-3">
          <button
            onClick={() => setShowMonthly((v) => !v)}
            className="flex w-full items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
            aria-expanded={showMonthly}
          >
            <span className="flex items-center gap-1.5">
              <CalendarDays size={14} />
              每月固定 {monthly.length} 项
            </span>
            <span className="ml-auto text-xs">{showMonthly ? '收起' : '展开'}</span>
          </button>
          {showMonthly && (
            <div className="mt-2">
              {monthly.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onToggle={actions.toggle}
                  onEdit={editor.openEdit}
                  onDelete={actions.remove}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 每周固定提醒（与每月固定同一处理：次级折叠，不占主列表视觉权重） */}
      {weekly.length > 0 && (
        <div className="mt-6 border-t border-line pt-3">
          <button
            onClick={() => setShowWeekly((v) => !v)}
            className="flex w-full items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
            aria-expanded={showWeekly}
          >
            <span className="flex items-center gap-1.5">
              <CalendarDays size={14} />
              每周固定 {weekly.length} 项
            </span>
            <span className="ml-auto text-xs">{showWeekly ? '收起' : '展开'}</span>
          </button>
          {showWeekly && (
            <div className="mt-2">
              {weekly.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onToggle={actions.toggle}
                  onEdit={editor.openEdit}
                  onDelete={actions.remove}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 已完成：并入「待办」同一节，弱化为一行小字入口（不抢视觉权重，需要时展开） */}
      <div className="mt-3">
        <button
          onClick={() => setShowDone((v) => !v)}
          className="flex w-full items-center gap-2 py-1 text-xs text-ink-faint transition-colors hover:text-ink-muted"
          aria-expanded={showDone}
        >
          已完成 · {done.length}
          <span className="ml-auto text-xs">{showDone ? '收起' : '展开'}</span>
        </button>
        {showDone && done.length > 0 && (
          <div className="mt-2">
            {done.slice(0, 50).map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onToggle={actions.toggle}
                onEdit={editor.openEdit}
                onDelete={actions.remove}
              />
            ))}
          </div>
        )}
        {showDone && done.length === 0 && (
          <p className="py-2 text-xs text-ink-faint">
            <CheckCircle2 size={13} className="mr-1 inline text-cinnabar" />
            尚无已完成事项
          </p>
        )}
      </div>

      <TaskEditor open={editor.open} onClose={editor.close} task={editor.editing} onSave={actions.save} />
    </Section>
  )
}
