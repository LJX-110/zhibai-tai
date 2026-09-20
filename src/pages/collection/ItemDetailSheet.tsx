/**
 * 藏 · 藏品详情抽屉
 */
import { ExternalLink, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, Sheet } from '../../components/ui'
import type { CollectionItem } from '../../types/entities'
import { cn } from '../../utils/cn'
import { TYPE_LABEL, typeStripe } from './shared'

export function ItemDetailSheet({
  detail,
  onClose,
  tidyBusy,
  onTidy,
  onRemove,
  onEdit,
}: {
  detail: CollectionItem | null
  onClose: () => void
  tidyBusy: boolean
  onTidy: (it: CollectionItem) => void
  onRemove: (it: CollectionItem) => void
  onEdit: (it: CollectionItem) => void
}) {
  return (
    <Sheet open={detail != null} onClose={onClose} title={detail?.title}>
      {detail && (
        <div className="space-y-4">
          {/* 详情头沿用列表卡那道「左侧类型签条」，打开时看得出是同一件东西 */}
          <div className="relative flex flex-wrap items-center gap-2 rounded-tile border border-line bg-raised px-3 py-2 pl-4">
            <span className={cn('absolute inset-y-0 left-0 w-[3px]', typeStripe(detail.type))} />
            <Badge tone="cinnabar">类型 · {TYPE_LABEL[detail.type]}</Badge>
            {/* 分类与状态都是用户自填的自由文本：Badge 是 nowrap，长文案会撑破弹层 */}
            {detail.category && (
              <Badge tone="teal" className="max-w-full truncate">
                {detail.category}
              </Badge>
            )}
            {detail.status && <Badge className="max-w-full truncate">{detail.status}</Badge>}
            {detail.rating != null && (
              <span className="tabular text-sm text-bronze">{'★'.repeat(detail.rating)}</span>
            )}
          </div>
          {detail.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{detail.description}</p>
          )}
          {detail.notes && (
            <div className="rounded-paper bg-raised p-3">
              <p className="mb-1 text-xs text-ink-faint">备注</p>
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{detail.notes}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {detail.tags.map((t) => (
              <span key={t} className="text-xs text-ink-faint">#{t}</span>
            ))}
          </div>
          {detail.url && (
            <a
              href={detail.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-teal link-underline"
            >
              <ExternalLink size={14} /> 打开链接
            </a>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => onTidy(detail)} disabled={tidyBusy}>
              <Sparkles size={13} /> {tidyBusy ? '整理中…' : 'AI 整理'}
            </Button>
            <Button variant="danger" onClick={() => onRemove(detail)}>
              <Trash2 size={14} /> 删除
            </Button>
            <Button variant="primary" onClick={() => onEdit(detail)}>
              <Pencil size={14} /> 编辑
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
