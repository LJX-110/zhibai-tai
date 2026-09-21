/**
 * 术 · 单个 AI 能力的行
 */
import { createElement } from 'react'
import { Power, Trash2 } from 'lucide-react'
import type { AIResource } from '../../types/entities'
import { Badge, Button } from '../../components/ui'
import { cn } from '../../utils/cn'
import { typeIcon } from './shared'

export function ResourceRow({
  r,
  onOpen,
  onToggle,
  onEdit,
  onRemove,
}: {
  r: AIResource
  onOpen: () => void
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <div className="row">
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`查看 ${r.name} 详情`}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-control border',
            r.enabled ? 'border-teal/30 bg-teal/10 text-teal' : 'border-line bg-raised text-ink-faint',
          )}
        >
          {/* 用 createElement 而不是「渲染期 const Icon = …」：
              后者会让 React Compiler 判定为「渲染中创建组件」并整块跳过优化 */}
          {createElement(typeIcon(r.type), { size: 15 })}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-sm font-medium', r.enabled ? 'text-ink' : 'text-ink-faint')}>
              {r.name}
            </span>
            <Badge tone="teal">{r.type}</Badge>
            {r.provider && <span className="text-xs text-ink-muted">{r.provider}</span>}
          </div>
          {r.description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{r.description}</p>
          )}
          <div className="mt-0.5 flex flex-wrap gap-x-2">
            {r.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-xs text-ink-faint">#{t}</span>
            ))}
          </div>
        </div>
      </button>
      <button
        onClick={onToggle}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-control px-2 py-1.5 text-xs transition-colors',
          r.enabled ? 'text-teal' : 'text-ink-faint',
        )}
        aria-label={r.enabled ? '停用' : '启用'}
      >
        <Power size={13} /> {r.enabled ? '停用' : '启用'}
      </button>
      <Button size="sm" variant="tertiary" onClick={onEdit}>
        编辑
      </Button>
      <button
        onClick={onRemove}
        className="rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-cinnabar"
        aria-label="删除"
        title="删除该能力"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
