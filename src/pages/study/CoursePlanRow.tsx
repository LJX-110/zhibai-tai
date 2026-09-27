/**
 * 学 · 学分选课的条目列表（行 + 公选分组）
 *
 * 从 `CoursePlanTab` 抽出：那一页已顶到单文件 400 行上限，
 * 而"怎么显示一条 / 怎么按分组摊开"是自成一块的渲染逻辑。
 */
import { Trash2 } from 'lucide-react'
import type { CoursePlan } from '../../types/entities'
import { EmptyState } from '../../components/ui'
import { cn } from '../../utils/cn'
import { KIND_LABEL, STATUS_LABEL, STATUS_MARK, trim } from './plan-shared'

/** 一条规划条目（点正文进编辑；删除按钮走 `.hover-reveal`，触屏常显） */
export function PlanRow({
  item,
  onEdit,
  onRemove,
  showKind,
}: {
  item: CoursePlan
  onEdit: () => void
  onRemove: () => void
  /** 在「候选 / 不可选」汇总里多给一个方向标记，否则看不出它属于限选还是公选 */
  showKind?: boolean
}) {
  return (
    <div className="row">
      <span
        className={cn(
          'w-4 shrink-0 text-center text-sm',
          item.status === 'selected' ? 'text-teal' : 'text-ink-faint',
        )}
        aria-label={STATUS_LABEL[item.status]}
      >
        {STATUS_MARK[item.status]}
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <span className="text-sm text-ink">{item.title}</span>
        {item.teacher && <span className="ml-2 text-xs text-ink-faint">{item.teacher}</span>}
        {item.note && <span className="ml-2 text-xs text-ink-faint">· {item.note}</span>}
      </button>
      {showKind && <span className="shrink-0 text-xs text-ink-faint">{KIND_LABEL[item.kind]}</span>}
      {item.status !== 'selected' && (
        <span className="shrink-0 text-xs text-ink-faint">{STATUS_LABEL[item.status]}</span>
      )}
      <span className="tabular shrink-0 text-xs text-ink-muted">
        {item.credit != null ? `${trim(item.credit)} 学分` : '—'}
      </span>
      <button
        className="hover-reveal touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar"
        onClick={onRemove}
        aria-label="删除"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

/**
 * 公选：按 `group` 分组展示；**没填分组的平铺在最后**（"未分类"）。
 *
 * 分组顺序来自 `publicGroupsOf`（首次出现的顺序 = 你录入的顺序），不排序 ——
 * 这六个分类是你学校的规定顺序，按拼音重排只会更难找。
 */
export function PublicList({
  groups,
  ungrouped,
  onEdit,
  onRemove,
  onAddIn,
}: {
  groups: { group: string; items: CoursePlan[] }[]
  ungrouped: CoursePlan[]
  onEdit: (c: CoursePlan) => void
  onRemove: (c: CoursePlan) => void
  onAddIn: (group: string) => void
}) {
  if (groups.length === 0 && ungrouped.length === 0) {
    return <EmptyState title="还没有条目" />
  }
  return (
    <div className="space-y-2">
      {groups.map(({ group, items }) => (
        <div key={group}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">{group}</span>
            <button
              className="text-xs text-ink-faint hover:text-ink"
              onClick={() => onAddIn(group)}
              aria-label={`在「${group}」下添加`}
            >
              ＋
            </button>
          </div>
          {items.map((c) => (
            <PlanRow key={c.id} item={c} onEdit={() => onEdit(c)} onRemove={() => onRemove(c)} />
          ))}
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">未分类</span>
            <button className="text-xs text-ink-faint hover:text-ink" onClick={() => onAddIn('')}>
              ＋
            </button>
          </div>
          {ungrouped.map((c) => (
            <PlanRow key={c.id} item={c} onEdit={() => onEdit(c)} onRemove={() => onRemove(c)} />
          ))}
        </div>
      )}
    </div>
  )
}
