/**
 * TaskItem —— 待办行（异印勾选 / 标题 / 标签 / 截止 / 关联项目课程 / 操作）
 * 完成交互：墨线/朱砂 → 异印落印 → 轻微缩放 → 归位
 */
import { useEffect, useRef, useState } from 'react'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useCourseStore } from '../../stores/useStudyStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useInspectorStore } from '../inspector/inspector-store'
import { Seal } from '../ui/Seal'
import { SealCheckbox } from '../ui/SealCheckbox'
import { playSound } from '../../services/sound'
import type { Task } from '../../types/entities'
import { diffDays, effectiveDone, friendlyDate, weekdayCN } from '../../utils/id'
import { cn } from '../../utils/cn'
import { Badge } from '../ui/Badge'
import { PRIORITY_LABEL, PRIORITY_TONE } from './shared'
import { Tooltip } from '../ui/Tooltip'

// 「急/中/缓」的标签与取色统一在 ./shared —— 别再本地各写一份

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
  /* ⚠️ 渲染一律走 effectiveDone，**不要直接读 task.done**。
     固定任务（每日/每周/每月）只有一条记录，`done` 跨期不重置：上周完成的「每日固定」
     至今仍是 done=true，可本周还没做。直接读 done 会让它「勾着却仍挂在今天要做的清单里」。
     effectiveDone 对固定任务问的是「**本期**做没做」，与完成/撤销用的是同一个判据。 */
  const done = effectiveDone(task)
  const overdue = task.dueDate && !done && diffDays(task.dueDate) < 0
  const dueToday = task.dueDate && !done && diffDays(task.dueDate) === 0
  // 落印动画：由未完成 → 完成瞬间触发
  const [stamp, setStamp] = useState(false)
  const prevDoneRef = useRef(done)

  useEffect(() => {
    if (done && !prevDoneRef.current) {
      setStamp(true)
      playSound('seal')
      const t = window.setTimeout(() => setStamp(false), 720)
      prevDoneRef.current = true
      return () => window.clearTimeout(t)
    }
    prevDoneRef.current = done
  }, [done])

  return (
    <div className={cn('row group relative', highlight && 'bg-cinnabar/4 hover:bg-cinnabar/8')}>
      {/* 异印完成勾选 —— 形制来自共用组件 SealCheckbox（与作业行同一处实现） */}
      <SealCheckbox checked={done} onChange={() => onToggle(task)} char="异" />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-sm transition-colors',
            // 已完成只弱化颜色，不画删除线（用户反馈：横线破坏阅读）
            done ? 'text-ink-faint' : 'text-ink',
          )}
        >
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_TONE[task.priority]} className="!px-1">
            {PRIORITY_LABEL[task.priority]}
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
          {task.repeat === 'daily' && (
            <Badge tone="bronze" className="!px-1">
              每日
            </Badge>
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
