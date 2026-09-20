/**
 * Inspector · 任务详情（按 id 自己取实体，找不到则显示空态）
 */
import { Trash2 } from 'lucide-react'
import { useTaskStore } from '../../stores/useTaskStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { toggleTaskCore } from '../../hooks/useTaskActions'
import { useToast } from '../ui/Toast'
import { Badge, Button } from '../ui'
import { friendlyDate } from '../../utils/id'
import { ActionSection, EmptyInspector, InspectorShell, MetaSection } from './shared'

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast().toast
  const task = useTaskStore((s) => s.items.find((t) => t.id === id))
  const project = useProjectStore((s) => s.items.find((p) => p.id === task?.projectId))
  const courseLink = useCourseStore((s) => s.items.find((c) => c.id === task?.courseId))

  if (!task) return <EmptyInspector onClose={onClose} />

  return (
    <InspectorShell title="任务详情" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">{task.title}</h3>
      {task.description && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{task.description}</p>}
      <MetaSection>
        <Badge tone={task.priority === 'high' ? 'cinnabar' : task.priority === 'mid' ? 'bronze' : 'plain'}>
          {task.priority === 'high' ? '急' : task.priority === 'mid' ? '中' : '缓'}
        </Badge>
        {task.dueDate && <Badge tone="plain">{friendlyDate(task.dueDate)}</Badge>}
        {project && <Badge tone="teal">项目 · {project.name}</Badge>}
        {courseLink && <Badge tone="cinnabar">课程 · {courseLink.name}</Badge>}
      </MetaSection>
      <ActionSection>
        <Button
          variant={task.done ? 'secondary' : 'primary'}
          onClick={async () => {
            // 与待办列表共用同一完成核心：重复任务完成时同样生成下一次
            const { done, createdNext } = await toggleTaskCore(task)
            toast(
              done ? (createdNext ? '完成待办 · 已生成下一次' : '完成待办 · 道行有进') : '已标记未完成',
              done ? 'success' : undefined,
            )
          }}
        >
          {task.done ? '标记未完成' : '标记完成'}
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            await useTaskStore.getState().remove(task.id)
            onClose()
            toast('已删除')
          }}
        >
          <Trash2 size={14} /> 删除
        </Button>
      </ActionSection>
    </InspectorShell>
  )
}
