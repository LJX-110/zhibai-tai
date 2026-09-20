/**
 * 命令面板 · 单行（命令与搜索结果共用同一形制）
 */
import { Plus } from 'lucide-react'
import { cn } from '../../../utils/cn'

export function CommandRow({
  active,
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  active: boolean
  icon?: typeof Plus
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-tile px-3 py-2 text-left transition-colors',
        active ? 'bg-raised' : '',
      )}
    >
      {Icon && <Icon size={14} className="shrink-0 text-ink-muted" />}
      {/* min-w-0 是 truncate 生效前提：否则 flex 子项默认 min-width:auto，
         长标题不会收缩而是撑破整行、把右侧 hint 挤出屏外 */}
      <span className="min-w-0 truncate text-sm text-ink">{label}</span>
      {hint && <span className="ml-auto shrink-0 text-xs text-ink-faint">{hint}</span>}
    </button>
  )
}
