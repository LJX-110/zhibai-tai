/**
 * Inspector · 占卜记录详情
 */
import { Trash2 } from 'lucide-react'
import { useDivinationStore } from '../../stores/useDivinationStore'
import { useToast } from '../ui/Toast'
import { Badge, Button } from '../ui'
import { ActionSection, EmptyInspector, InspectorShell, MetaSection } from './shared'

export function DivinationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast().toast
  const divRecord = useDivinationStore((s) => s.items.find((d) => d.id === id))

  if (!divRecord) return <EmptyInspector onClose={onClose} />

  return (
    <InspectorShell title="占卜详情" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">{divRecord.title}</h3>
      <MetaSection>
        <Badge tone={divRecord.type === 'bagua' ? 'teal' : divRecord.type === 'daily_sign' ? 'cinnabar' : 'plain'}>
          {divRecord.type === 'daily_sign' ? '每日签' : divRecord.type === 'bagua' ? '梅花' : divRecord.type === 'dayan' ? '大衍' : divRecord.type}
        </Badge>
        <Badge tone="plain">{divRecord.date}</Badge>
      </MetaSection>
      {divRecord.interpretation && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{divRecord.interpretation}</p>}
      {divRecord.detail && (
        <pre className="mt-3 whitespace-pre-wrap rounded-tile bg-nested/50 p-3 font-mono text-xs text-ink-muted">
          {divRecord.detail}
        </pre>
      )}
      {divRecord.input && <p className="mt-3 text-xs text-ink-faint">起盘：{divRecord.input}</p>}
      {divRecord.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {divRecord.tags?.map((t) => <span key={t} className="text-xs text-ink-faint">#{t}</span>)}
        </div>
      )}
      <ActionSection>
        <Button
          variant="danger"
          onClick={async () => {
            await useDivinationStore.getState().remove(divRecord.id)
            onClose()
            toast('已删除该条存档')
          }}
        >
          <Trash2 size={14} /> 删除
        </Button>
      </ActionSection>
    </InspectorShell>
  )
}
