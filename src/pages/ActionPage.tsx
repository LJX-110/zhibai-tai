/**
 * 行 —— 践行（今日 · 待办 · 日历 · 记事本）
 * V1.8：待办简化为「未完成清单 + 每月固定提醒」，每月 N 号固定提醒（如 27 号交话费）；
 * 保数据、保功能，只清结构。
 */
import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, Search } from 'lucide-react'
import { useTaskStore } from '../stores/useTaskStore'
import { useNoteStore } from '../stores/useNoteStore'
import { useTaskActions } from '../hooks/useTaskActions'
import { TaskItem } from '../components/task/TaskItem'
import { TaskEditor } from '../components/task/TaskEditor'
import { NoteItem } from '../components/note/NoteItem'
import { NoteEditor } from '../components/note/NoteEditor'
import { Calendar } from '../components/ui/Calendar'
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Section,
  Tabs,
  type TabItem,
} from '../components/ui'
import { cn } from '../utils/cn'
import {
  createId,
  diffDays,
  friendlyDate,
  monthlyDoneThisMonth,
  monthlyDueToday,
  todayISO,
} from '../utils/id'
import type { Note, Task } from '../types/entities'

const TABS: TabItem[] = [
  { key: 'today', label: '今日' },
  { key: 'todo', label: '待办' },
  { key: 'calendar', label: '日历' },
  { key: 'notes', label: '记事本' },
]

export function ActionPage() {
  const [tab, setTab] = useState('today')
  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="千里之行，始于足下" title="行 · 践行" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />
      {tab === 'today' && <TodayTab />}
      {tab === 'todo' && <TodoTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'notes' && <NotesTab />}
    </div>
  )
}

function useTaskEditor() {
  const [editing, setEditing] = useState<Task | null>(null)
  const [open, setOpen] = useState(false)
  return {
    editing,
    open,
    openNew: () => {
      setEditing(null)
      setOpen(true)
    },
    openEdit: (t: Task) => {
      setEditing(t)
      setOpen(true)
    },
    close: () => {
      setOpen(false)
      setEditing(null)
    },
  }
}

/** 今日 —— 今日要做的（含每月固定今日到期）+ 快捷添加 */
function TodayTab() {
  const tasks = useTaskStore((s) => s.items)
  const actions = useTaskActions()
  const editor = useTaskEditor()
  const today = todayISO()
  const [quick, setQuick] = useState('')

  const regular = tasks
    .filter(
      (t) => !t.done && t.monthlyDay == null && (t.dueDate === today || diffDays(t.dueDate ?? '9999') < 0),
    )
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  // 每月固定且今天到期（本月未完成）
  const monthlyToday = tasks.filter(
    (t) => !t.done && t.monthlyDay != null && monthlyDueToday(t) && !monthlyDoneThisMonth(t),
  )
  const openToday = [...regular, ...monthlyToday]

  const quickAdd = async () => {
    if (!quick.trim()) return
    const now = new Date().toISOString()
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
      projectId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    setQuick('')
  }

  return (
    <Section
      title="今日"
      hint={`${openToday.length} 项待处理`}
      action={
        <Button size="sm" variant="tertiary" onClick={editor.openNew}>
          <Plus size={14} /> 添加
        </Button>
      }
    >
      <div className="mb-3 flex gap-2">
        <Input
          placeholder="快速记一条今天要做的事，回车即加…"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
        />
        <Button variant="primary" onClick={quickAdd} disabled={!quick.trim()}>
          <Plus size={14} />
        </Button>
      </div>
      {openToday.length > 0 ? (
        <div>
          {openToday.map((t) => (
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
        <EmptyState title="今日无待办" desc="可在上方快捷添加，或去「待办」查看全部与每月固定提醒" />
      )}
      <TaskEditor open={editor.open} onClose={editor.close} task={editor.editing} onSave={actions.save} />
    </Section>
  )
}

/** 待办 —— 未完成清单 + 每月固定提醒（简单直接，不做复杂分组） */
function TodoTab() {
  const tasks = useTaskStore((s) => s.items)
  const actions = useTaskActions()
  const editor = useTaskEditor()
  const [query, setQuery] = useState('')
  const [showDone, setShowDone] = useState(false)

  const q = query.trim().toLowerCase()
  const match = (t: Task) =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    t.tags.some((tg) => tg.toLowerCase().includes(q)) ||
    (t.dueDate ?? '').includes(q)

  // 未完成：普通任务（非每月固定）按日期排序
  const open = tasks
    .filter((t) => !t.done && t.monthlyDay == null && match(t))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  // 每月固定：本月未完成，按 N 号排序（作为提醒展示）
  const monthly = tasks
    .filter((t) => t.monthlyDay != null && !monthlyDoneThisMonth(t) && match(t))
    .sort((a, b) => (a.monthlyDay ?? 31) - (b.monthlyDay ?? 31))

  const done = tasks
    .filter((t) => t.done && match(t))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const overdueCount = open.filter((t) => t.dueDate && diffDays(t.dueDate) < 0).length
  const todayMonthly = monthly.filter((t) => monthlyDueToday(t))

  return (
    <Section
      title="待办"
      hint={`未完成 ${open.length} · 每月固定 ${monthly.length} · 已完成 ${done.length}`}
      action={
        <Button size="sm" variant="tertiary" onClick={editor.openNew}>
          <Plus size={14} /> 添加
        </Button>
      }
    >
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
        <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-cinnabar/30 bg-cinnabar/5 px-3 py-2">
          <span className="h-1.5 w-1.5 rotate-45 bg-cinnabar" />
          <span className="text-[13px] text-ink">
            今日固定 · {todayMonthly.map((t) => t.title).join('、')}
          </span>
          <span className="mono-meta ml-auto text-cinnabar">每月提醒</span>
        </div>
      )}
      {overdueCount > 0 && (
        <div className="mb-3 rounded-[8px] border border-cinnabar/30 bg-cinnabar/5 px-3 py-2 text-[13px] text-cinnabar">
          有 {overdueCount} 项已逾期，先处理它们
        </div>
      )}

      {/* 未完成清单 */}
      <div className="section-title text-sm">
        <span className="scribal text-base text-ink">待办</span>
        <span className="hint">未完成 {open.length}</span>
      </div>
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

      {/* 每月固定提醒 */}
      {monthly.length > 0 && (
        <div className="mt-5">
          <div className="section-title text-sm">
            <span className="scribal text-base text-bronze">每月固定</span>
            <span className="hint">每月这天提醒你 · {monthly.length} 项</span>
          </div>
          <div>
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
        </div>
      )}

      {/* 已完成 */}
      <div className="mt-6 border-t border-line pt-3">
        <button
          onClick={() => setShowDone((v) => !v)}
          className="flex w-full items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <span className={cn('h-1.5 w-1.5 rotate-45', done.length ? 'bg-cinnabar' : 'bg-line-strong')} />
          已完成 · {done.length}
          <span className="ml-auto text-xs text-ink-faint">{showDone ? '收起' : '展开'}</span>
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

/** 日历 */
function CalendarTab() {
  const tasks = useTaskStore((s) => s.items)
  const actions = useTaskActions()
  const editor = useTaskEditor()
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [selected, setSelected] = useState<string | null>(todayISO())

  const marks = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of tasks) {
      if (t.dueDate && !t.done) map[t.dueDate] = (map[t.dueDate] ?? 0) + 1
    }
    return map
  }, [tasks])

  const dayTasks = tasks
    .filter((t) => t.dueDate === selected)
    .sort((a, b) => Number(a.done) - Number(b.done))

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <Calendar
          month={month}
          onMonthChange={setMonth}
          marks={marks}
          selected={selected}
          onSelectDate={setSelected}
        />
        <p className="mt-2 text-xs text-ink-faint">
          {selected && friendlyDate(selected)} · 铜点表示有安排
        </p>
      </div>
      <div className="lg:col-span-7">
        <Section
          title={selected ? friendlyDate(selected) : '选择日期'}
          hint={`${dayTasks.length} 项`}
          action={
            <Button size="sm" variant="tertiary" onClick={editor.openNew}>
              <Plus size={14} /> 添加
            </Button>
          }
        >
          {dayTasks.length > 0 ? (
            <div>
              {dayTasks.map((t) => (
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
            <EmptyState title="当日无待办" />
          )}
        </Section>
      </div>
      <TaskEditor open={editor.open} onClose={editor.close} task={editor.editing} onSave={actions.save} />
    </div>
  )
}

/** 记事本 */
function NotesTab() {
  const notes = useNoteStore((s) => s.items)
  const [editing, setEditing] = useState<Note | null>(null)
  const [open, setOpen] = useState(false)
  const [kindFilter, setKindFilter] = useState<'all' | 'note' | 'inspiration'>('all')

  const list = notes
    .filter((n) => kindFilter === 'all' || n.kind === kindFilter)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))

  const save = async (n: Note) => {
    await useNoteStore.getState().save(n)
  }
  const remove = async (n: Note) => {
    await useNoteStore.getState().remove(n.id)
  }
  const togglePin = async (n: Note) => {
    await useNoteStore.getState().update(n.id, { pinned: !n.pinned })
  }

  return (
    <Section
      title="记事本"
      hint={`${notes.length} 条`}
      action={
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-[6px] border border-line bg-nested/50 p-0.5">
            {(['all', 'note', 'inspiration'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={cn(
                  'rounded-[4px] px-2 py-0.5 text-xs transition-colors',
                  kindFilter === k ? 'bg-paper text-ink' : 'text-ink-muted',
                )}
              >
                {k === 'all' ? '全部' : k === 'note' ? '记录' : '灵感'}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus size={14} /> 添加
          </Button>
        </div>
      }
    >
      {list.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              onEdit={(note) => {
                setEditing(note)
                setOpen(true)
              }}
              onDelete={remove}
              onTogglePin={togglePin}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="还没有记录" desc="随手记下想法、灵感或待整理内容" />
      )}
      <NoteEditor
        open={open}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        note={editing}
        defaultKind="note"
        onSave={save}
      />
    </Section>
  )
}
