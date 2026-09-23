/**
 * 行 · 待办页的固定任务分组（每日 / 每周 / 每月共用）
 *
 * 三个分组此前是**三段几乎逐字重复的标记**（只有变量名与文案不同），
 * 改一处忘另一处就会出现"每日能折叠、每月不能"这类不一致。
 * 抽成一份实现后，折叠行为、间距、图标、展开态管理天然一致。
 *
 * 折叠态由本组件自己持有：调用方只关心"渲染哪一组"，不必维护三个 useState。
 */
import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { Task } from '../../types/entities'
import { TaskItem } from '../../components/task/TaskItem'

export function FixedGroup({
  label,
  tasks,
  doneCount,
  onToggle,
  onEdit,
  onDelete,
}: {
  /** 分组名，如「每日固定」 */
  label: string
  /** 本组全部在世记录（**含本期已做的**，它们留在原位打勾，不再跳去「已完成」） */
  tasks: Task[]
  /** 其中本期已做的条数，只用于组头提示 */
  doneCount: number
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const [open, setOpen] = useState(false)
  if (tasks.length === 0) return null

  return (
    <div className="mt-6 border-t border-line pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <CalendarDays size={14} />
          {label} {tasks.length - doneCount} 项
          {/* 本期进度：固定任务不搬去「已完成」，那就在这里说清"今天这条已经做掉了" */}
          {doneCount > 0 && (
            <span className="text-xs text-teal">· 已完成 {doneCount}</span>
          )}
        </span>
        <span className="ml-auto text-xs">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="mt-2">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
