/**
 * Inspector · 藏品详情
 */
import { ExternalLink } from 'lucide-react'
import { useCollectionStore } from '../../stores/useCollectionStore'
import { Badge } from '../ui'
import { EmptyInspector, InspectorShell, MetaSection } from './shared'

export function CollectionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useCollectionStore((s) => s.items.find((c) => c.id === id))

  if (!item) return <EmptyInspector onClose={onClose} />

  return (
    <InspectorShell title="藏品详情" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">{item.title}</h3>
      {item.description && <p className="mt-2 text-sm text-ink-soft">{item.description}</p>}
      <MetaSection>
        <Badge tone="plain">{item.type}</Badge>
        {/* 状态是用户自填的自由文本且可能很长，而 Badge 自带 nowrap ——
            不约束会在移动端把底部弹层横向撑破（列表卡那边已做同样处理） */}
        {item.status && <Badge className="max-w-full truncate">{item.status}</Badge>}
        {item.rating != null && <Badge tone="bronze">{'★'.repeat(item.rating)}</Badge>}
      </MetaSection>
      {item.notes && <p className="mt-3 whitespace-pre-wrap text-xs text-ink-muted">{item.notes}</p>}
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-teal link-underline">
          <ExternalLink size={14} /> 打开链接
        </a>
      )}
    </InspectorShell>
  )
}
