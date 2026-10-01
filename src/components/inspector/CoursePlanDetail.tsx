/**
 * Inspector · 选课条目详情
 *
 * 与「财 · 流水」的详情同构：标题 → 状态徽标 → 核心数字 → 补充信息。
 *
 * ## 为什么补这一档
 * 选课行此前只有「改条目 / 删除」—— 教师、公选分类、备注都要**进编辑弹窗才看得到**，
 * 而"只想看一眼"是最常见的动作，不该以"进入修改态"为代价。补齐后与待办、流水
 * 三处的操作语言一致：**详情 / 编辑 / 删除**。
 *
 * ⚠️ 这里**不显示"关联课程"**：`CoursePlan`（培养方案视角）与 `Course`（本学期视角）
 * 是刻意互不依赖的两套数据，硬连会在两边都产生假关联。
 */
import { useCoursePlanStore } from '../../stores/useCoursePlanStore'
import { Badge } from '../ui'
import { KIND_LABEL, STATUS_LABEL, trim } from '../../pages/study/plan-shared'
import { EmptyInspector, InspectorShell, MetaSection } from './shared'

/** 状态 → 徽标色调（与列表里的印章语义一致：已选=青、候选=金、不可选=墨） */
const STATUS_TONE = { selected: 'teal', candidate: 'bronze', unavailable: 'plain' } as const

export function CoursePlanDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useCoursePlanStore((s) => s.items.find((c) => c.id === id))

  if (!item) return <EmptyInspector onClose={onClose} />

  const rows: [string, string | undefined][] = [
    ['教师', item.teacher],
    ['备注', item.note],
    ['更新', item.updatedAt?.slice(0, 10)],
  ]

  return (
    <InspectorShell title="选课条目" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">{item.title}</h3>
      <MetaSection>
        <Badge tone="plain">{KIND_LABEL[item.kind]}</Badge>
        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
        {item.group && item.kind === 'public' && <Badge tone="plain">{item.group}</Badge>}
      </MetaSection>
      <div className="mt-3 text-3xl font-semibold tabular text-ink-bright">
        {item.credit != null ? trim(item.credit) : '—'}
        <span className="ml-1.5 text-sm font-normal text-ink-muted">学分</span>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <span className="w-10 shrink-0 text-ink-faint">{k}</span>
            <span className="min-w-0 flex-1 text-ink-muted">{v || '—'}</span>
          </div>
        ))}
      </div>
    </InspectorShell>
  )
}
