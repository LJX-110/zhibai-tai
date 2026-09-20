/**
 * Inspector · 消费详情
 */
import { useFinanceStore } from '../../stores/useFinanceStore'
import { Badge } from '../ui'
import { EmptyInspector, InspectorShell, MetaSection } from './shared'

export function FinanceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const finance = useFinanceStore((s) => s.items.find((f) => f.id === id))

  if (!finance) return <EmptyInspector onClose={onClose} />

  return (
    <InspectorShell title="消费详情" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">
        {finance.merchant || finance.note || '流水'}
      </h3>
      <MetaSection>
        <Badge tone={finance.kind === 'income' ? 'teal' : 'cinnabar'}>
          {finance.kind === 'income' ? '收入' : '支出'}
        </Badge>
        <Badge tone="plain">{finance.category}</Badge>
        {finance.isPurchase && <Badge tone="bronze">购买</Badge>}
      </MetaSection>
      <div className="mt-3 text-3xl font-semibold tabular text-ink-bright">
        {finance.kind === 'income' ? '+' : '-'}{finance.amount.toFixed(2)}
      </div>
      <div className="mt-1 text-xs text-ink-faint">{finance.date}</div>
      {finance.note && <p className="mt-2 text-xs text-ink-muted">{finance.note}</p>}
    </InspectorShell>
  )
}
