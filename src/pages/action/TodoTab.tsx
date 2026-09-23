/**
 * 行 · 待办页签 —— 今日快捷添加 + 未完成清单（按急/中/缓）+ 每日/每周/每月固定
 * （合并原「今日」页签）
 */
import { useState } from 'react'
import { CheckCircle2, Plus, Search } from 'lucide-react'
import { useTaskStore } from '../../stores/useTaskStore'
import { useTaskActions } from '../../hooks/useTaskActions'
import { TaskItem } from '../../components/task/TaskItem'
import { byPriorityThenDue } from '../../components/task/shared'
import { FixedGroup } from './FixedGroup'
import { TaskEditor } from '../../components/task/TaskEditor'
import { Button, Input, Section } from '../../components/ui'
import { createId, diffDays, effectiveDone, isFixedSchedule, liveFixedTasks, monthlyDueToday, weeklyDueToday, todayISO, nowISO } from '../../utils/id'
import type { Task } from '../../types/entities'
import { useTaskEditor } from './useTaskEditor'

export function TodoTab() {
  const tasks = useTaskStore((s) => s.items)
  const actions = useTaskActions()
  const editor = useTaskEditor()
  const [query, setQuery] = useState('')
  const [showDone, setShowDone] = useState(false)
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

  // 未完成：普通任务（非固定三式）按「急 → 中 → 缓」排，同档再看到期日。
  // 固定任务（每日/每周/每月）有自己的分组，混进主清单会出现同一件事两处显示。
  const open = tasks
    .filter((t) => !t.done && !isFixedSchedule(t) && match(t))
    .sort(byPriorityThenDue)

  // ⚠️ 固定任务必须先在「在世记录」上取，再判本期做没做。
  // 旧版完成固定任务会生成后继副本，历史副本每周都会被判成"本期未做"而重新冒出，
  // 一周多一条 —— 生成已堵住，但存量副本还在，展示层只认同系列里 createdAt 最新的那条
  // （系列键 = seriesId，存量退回「锚点 + 标题」，见 utils/id.ts 的 seriesKeyOf）。
  const liveFixed = liveFixedTasks(tasks)

  /* 本期已做的固定任务：**留在本组里打勾**，不搬去「已完成」。两个理由：
     ① 搬走就得在两处之间来回找同一件事；搬走的当下又没地方撤销（勾选在「已完成」里）；
     ② 下期它回到本组时会与「已完成」里那条长期并列 —— 同一件事两处显示。
     故这里的判据用 effectiveDone（固定任务问「本期」，普通任务读 done）。 */
  const fixedDone = new Set(liveFixed.filter((t) => effectiveDone(t)).map((t) => t.id))
  /** 组内排序：未做完的在前；同档保持调用方给的次序（已完成的沉到组尾，而非消失） */
  const byFixedOrder =
    (cmp: (a: Task, b: Task) => number) =>
    (a: Task, b: Task) =>
      Number(fixedDone.has(a.id)) - Number(fixedDone.has(b.id)) || cmp(a, b)

  // 每日固定：按创建时间排序
  const daily = liveFixed
    .filter((t) => t.repeat === 'daily' && match(t))
    .sort(byFixedOrder((a, b) => a.createdAt.localeCompare(b.createdAt)))

  // 每月固定：按 N 号排序（作为提醒展示）
  const monthly = liveFixed
    .filter((t) => t.monthlyDay != null && match(t))
    .sort(byFixedOrder((a, b) => (a.monthlyDay ?? 31) - (b.monthlyDay ?? 31)))

  // 每周固定：按 周日→周六 排序（与每月固定同一呈现位置）
  const weekly = liveFixed
    .filter((t) => t.weeklyDay != null && match(t))
    .sort(byFixedOrder((a, b) => (a.weeklyDay ?? 6) - (b.weeklyDay ?? 6)))

  // 「已完成」列表**只收普通任务**：固定任务的完成态由它自己的分组承担（见上），
  // 否则上一期完成的固定任务会永远挂在这里，与本期分组并列显示。
  const done = tasks
    .filter((t) => t.done && !isFixedSchedule(t) && match(t))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const overdueCount = open.filter((t) => t.dueDate && diffDays(t.dueDate) < 0).length
  // 「今日固定」提醒卡只报**还没做**的 —— 做掉了就不该再喊
  const todayDaily = daily.filter((t) => !fixedDone.has(t.id))
  const todayMonthly = monthly.filter((t) => !fixedDone.has(t.id) && monthlyDueToday(t))
  const todayWeekly = weekly.filter((t) => !fixedDone.has(t.id) && weeklyDueToday(t))

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
          placeholder="记一条待办，回车添加"
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

      {/* 今日固定提醒（三式同一张卡：今天该做而还没做的固定事） */}
      {todayDaily.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2">
          <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-cinnabar" />
          <span className="min-w-0 flex-1 text-sm text-ink">
            今日固定 · {todayDaily.map((t) => t.title).join('、')}
          </span>
          <span className="mono-meta ml-auto shrink-0 text-cinnabar">每日提醒</span>
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

      {/* 固定任务三式，顺序固定为「每日 → 每周 → 每月」：
          每日最高频所以最前；周与月的先后按人对"近期"的直觉排（周在下、月更远）。
          本期已做的留在组内打勾，组头显示「已完成 N」—— 它们不进「已完成」列表。 */}
      <FixedGroup label="每日固定" tasks={daily} doneCount={daily.length - todayDaily.length} onToggle={actions.toggle} onEdit={editor.openEdit} onDelete={actions.remove} />
      <FixedGroup label="每周固定" tasks={weekly} doneCount={weekly.length - todayWeekly.length} onToggle={actions.toggle} onEdit={editor.openEdit} onDelete={actions.remove} />
      <FixedGroup label="每月固定" tasks={monthly} doneCount={monthly.length - todayMonthly.length} onToggle={actions.toggle} onEdit={editor.openEdit} onDelete={actions.remove} />

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
