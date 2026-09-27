/**
 * 学 · 课程列表（从 `CourseTab` 抽出）
 *
 * 为什么单独成文件：`CourseTab.tsx` 已顶到 400 行上限（单文件 ≤ 400 是硬规则），
 * 而这一块是**纯渲染**、不碰编辑器的任何状态 —— 抽出来两边都更清楚：
 * 列表只管"显示与三个操作"，编辑器只管"改一门课"。
 *
 * 空态放在这里（而不是父组件分支）：**列表为空的提示与列表本身是一件事**，
 * 拆到父组件去判会让"什么时候显示空态"散在两层。
 */
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { usePomodoroStore } from '../../stores/usePomodoroStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { useInspectorStore } from '../../components/inspector/inspector-store'
import { Badge, Button, EmptyState } from '../../components/ui'
import type { Course } from '../../types/entities'
import { describeWeeks } from '../../services/study'
import { WEEKDAY_SHORT, courseLabel } from './shared'

export function CourseList({
  courses,
  onEdit,
}: {
  courses: Course[]
  /** `null` = 新建（与 CourseTab 的 openEditor 同签名，直接透传即可） */
  onEdit: (c: Course | null) => void
}) {
  // 每门课的累计专注时长（番茄钟里绑定了该课程的会话）—— 这是"课程投入"的唯一现成证据
  const sessions = usePomodoroStore((s) => s.items)

  if (courses.length === 0) {
    return (
      <EmptyState
        title="还没有课程"
        action={
          <Button variant="primary" onClick={() => onEdit(null)}>
            <Plus size={14} /> 添加课程
          </Button>
        }
      />
    )
  }

  return (
    <div>
      {courses.map((c) => {
        const mins = sessions
          .filter((s) => s.type === 'focus' && s.courseId === c.id)
          .reduce((a, s) => a + s.durationMin, 0)
        return (
          <div key={c.id} className="row">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{courseLabel(c)}</span>
                {/* 课程性质：从原「课程统计」页挪来（那一页已改成「学分 · 选课」）——
                    放在学分旁边，让 `Course.kind` 有实际的显示位，而不是只写不读 */}
                {c.kind && (
                  <span className={c.kind === 'required' ? 'text-xs text-cinnabar' : 'text-xs text-teal'}>
                    {c.kind === 'required' ? '必修' : '选修'}
                  </span>
                )}
                <Badge tone="teal">{c.credit} 学分</Badge>
                {mins > 0 && <span className="seal seal--active">累计学习 {mins} 分钟</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                {c.teacher && <span>师 · {c.teacher}</span>}
                {c.room && <span>室 · {c.room}</span>}
                {c.schedule?.map((sl, i) => (
                  <span key={i} className="tabular">
                    周{WEEKDAY_SHORT[sl.weekday]} {sl.start}–{sl.end}
                    {sl.weeks && sl.weeks.length > 0 && (
                      <span className="ml-1 text-bronze">{describeWeeks(sl.weeks)}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink"
              onClick={() => useInspectorStore.getState().open('course', c.id)}
              aria-label="详情"
            >
              <Eye size={14} />
            </button>
            <button
              className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink"
              onClick={() => onEdit(c)}
              aria-label="编辑"
            >
              <Pencil size={14} />
            </button>
            <button
              className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar"
              onClick={() => useCourseStore.getState().remove(c.id)}
              aria-label="删除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
