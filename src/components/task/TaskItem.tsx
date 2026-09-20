/**
 * TaskItem —— 待办行（异印勾选 / 标题 / 标签 / 截止 / 关联项目课程 / 操作）
 * 完成交互：墨线/朱砂 → 异印落印 → 轻微缩放 → 归位
 */
import { useEffect, useRef, useState } from 'react'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useCourseStore } from '../../stores/useStudyStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useInspectorStore } from '../inspector/Inspector'
import { Seal } from '../ui/Seal'
import { SealCheckbox } from '../ui/SealCheckbox'
import { playSound } from '../../services/sound'
import type { Task } from '../../types/entities'
import { diffDays, friendlyDate, weekdayCN } from '../../utils/id'
import { cn } from '../../utils/cn'
import { Badge } from '../ui/Badge'
import { Tooltip } from '../ui/Tooltip'

const priorityLabel = { high: '急', mid: '中', low: '缓' } as const
const priorityTone = { high: 'cinnabar', mid: 'bronze', low: 'plain' } as const

export interface TaskItemProps {
  task: Task
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  /** 是否高亮显示（如首页重点） */
  highlight?: boolean
}

export function TaskItem({ task, onToggle, onEdit, onDelete, highlight }: TaskItemProps) {
  const project = useProjectStore((s) => s.items.find((p) => p.id === task.projectId))
  const course = useCourseStore((s) => s.items.find((c) => c.id === task.courseId))
  const overdue = task.dueDate && !task.done && diffDays(task.dueDate) < 0
  const dueToday = task.dueDate && !task.done && diffDays(task.dueDate) === 0
  // 落印动画：由未完成 → 完成瞬间触发
  const [stamp, setStamp] = useState(false)
  const prevDoneRef = useRef(task.done)

  useEffect(() => {
    if (task.done && !prevDoneRef.current) {
      setStamp(true)
      playSound('seal')
      const t = window.setTimeout(() => setStamp(false), 720)
      prevDoneRef.current = true
      return () => window.clearTimeout(t)
    }
    prevDoneRef.current = task.done
  }, [task.done])

  return (
    <div className={cn('row group relative', highlight && 'bg-cinnabar/4 hover:bg-cinnabar/8')}>
      {/* 异印完成勾选 —— 形制来自共用组件 SealCheckbox（与作业行同一处实现） */}
      <SealCheckbox checked={task.done} onChange={() => onToggle(task)} char="异" />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-sm transition-colors',
            // 已完成只弱化颜色，不画删除线（用户反馈：横线破坏阅读）
            task.done ? 'text-ink-faint' : 'text-ink',
          )}
        >
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={priorityTone[task.priority]} className="!px-1">
            {priorityLabel[task.priority]}
          </Badge>
          {task.dueDate && (
            <span
              className={cn(
                'tabular text-xs',
                overdue
                  ? 'text-cinnabar'
                  : dueToday
                    ? 'text-cinnabar/80'
                    : 'text-ink-faint',
              )}
            >
              {friendlyDate(task.dueDate)}
              {overdue && '（逾期）'}
            </span>
          )}
          {task.monthlyDay != null && (
            <Badge tone="bronze" className="!px-1">
              每月 {task.monthlyDay} 号
            </Badge>
          )}
          {task.weeklyDay != null && (
            <Badge tone="bronze" className="!px-1">
              每周 {weekdayCN(task.weeklyDay)}
            </Badge>
          )}
          {project && (
            <span className="text-xs text-teal">· {project.name}</span>
          )}
          {course && (
            <span className="text-xs text-bronze">· {course.name}</span>
          )}
          {task.tags.map((t) => (
            <span key={t} className="text-xs text-ink-faint">
              #{t}
            </span>
          ))}
        </div>
      </div>

      {/* hover-reveal：仅鼠标设备悬停显现，触屏常显（否则手机端按钮不可达） */}
      <div className="hover-reveal flex items-center gap-1">
        <Tooltip label="详情">
          <button
            className="rounded-control border border-line bg-raised p-1.5 text-ink-muted transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
            onClick={() => useInspectorStore.getState().open('task', task.id)}
            aria-label="详情"
          >
            <Eye size={14} />
          </button>
        </Tooltip>
        <Tooltip label="编辑">
          <button
            className="rounded-control border border-line bg-raised p-1.5 text-ink-muted transition-colors hover:border-teal/40 hover:text-teal"
            onClick={() => onEdit(task)}
            aria-label="编辑"
          >
            <Pencil size={14} />
          </button>
        </Tooltip>
        <Tooltip label="删除">
          <button
            className="rounded-control border border-line bg-raised p-1.5 text-ink-muted transition-colors hover:border-cinnabar/50 hover:text-cinnabar"
            onClick={() => onDelete(task)}
            aria-label="删除"
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>
      </div>

      {/* 落印动画（覆盖层） */}
      {stamp && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="seal-stamp flex items-center gap-2 rounded-tile bg-paper/85 px-3 py-1.5 shadow-float">
            <Seal size={22} char="异" tone="cinnabar" />
            <span className="scribal text-sm text-cinnabar">事毕</span>
          </span>
        </span>
      )}
    </div>
  )
}
