/**
 * 行 · 日历页签
 */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTaskStore } from '../../stores/useTaskStore'
import { useTaskActions } from '../../hooks/useTaskActions'
import { TaskItem } from '../../components/task/TaskItem'
import { TaskEditor } from '../../components/task/TaskEditor'
import { Calendar } from '../../components/ui/Calendar'
import { Button, EmptyState, Section } from '../../components/ui'
import { friendlyDate, todayISO } from '../../utils/id'
import { useTaskEditor } from './useTaskEditor'

export function CalendarTab() {
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
