/**
 * Inspector · AI 能力详情
 */
import { nowISO } from '../../utils/id'
import { Trash2 } from 'lucide-react'
import { useAIResourceStore } from '../../stores/useAIStore'
import { useToast } from '../ui/toast-store'
import { Badge, Button } from '../ui'
import { ActionSection, EmptyInspector, InspectorShell, MetaSection } from './shared'

export function AiDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast().toast
  const aiRes = useAIResourceStore((s) => s.items.find((a) => a.id === id))

  if (!aiRes) return <EmptyInspector onClose={onClose} />

  return (
    <InspectorShell title="AI 能力详情" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">{aiRes.name}</h3>
      <MetaSection>
        <Badge tone="teal">{aiRes.type}</Badge>
        {aiRes.provider && <Badge tone="plain">{aiRes.provider}</Badge>}
        <Badge tone={aiRes.enabled ? 'bronze' : 'plain'}>{aiRes.enabled ? '启用' : '停用'}</Badge>
      </MetaSection>
      {aiRes.description && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{aiRes.description}</p>}
      {aiRes.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {aiRes.tags?.map((t) => <span key={t} className="text-xs text-ink-faint">#{t}</span>)}
        </div>
      )}
      {aiRes.config && (
        <pre className="mt-3 overflow-x-auto rounded-tile bg-nested/50 p-3 font-mono text-xs text-ink-muted">
          {aiRes.config}
        </pre>
      )}
      <ActionSection>
        <Button
          variant={aiRes.enabled ? 'secondary' : 'primary'}
          onClick={async () => {
            await useAIResourceStore.getState().update(aiRes.id, {
              enabled: !aiRes.enabled,
              updatedAt: nowISO(),
            })
          }}
        >
          {aiRes.enabled ? '停用' : '启用'}
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            await useAIResourceStore.getState().remove(aiRes.id)
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
