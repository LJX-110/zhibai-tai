/**
 * Inspector · 课程详情
 */
import { useCourseStore } from '../../stores/useStudyStore'
import { Badge } from '../ui'
import { EmptyInspector, InspectorShell, MetaSection } from './shared'

export function CourseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const course = useCourseStore((s) => s.items.find((c) => c.id === id))

  if (!course) return <EmptyInspector onClose={onClose} />

  return (
    <InspectorShell title="课程详情" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">{course.name}</h3>
      <MetaSection>
        <Badge tone="teal">{course.credit} 学分</Badge>
        {course.teacher && <Badge tone="plain">师 · {course.teacher}</Badge>}
        {course.room && <Badge tone="plain">室 · {course.room}</Badge>}
      </MetaSection>
      {course.schedule?.length > 0 && (
        <div className="mt-3 space-y-1">
          {course.schedule?.map((s, i) => (
            <div key={i} className="text-xs text-ink-muted">
              周{['日', '一', '二', '三', '四', '五', '六'][s.weekday]} {s.start}–{s.end}
            </div>
          ))}
        </div>
      )}
      {course.note && <p className="mt-3 text-xs text-ink-muted">{course.note}</p>}
    </InspectorShell>
  )
}
