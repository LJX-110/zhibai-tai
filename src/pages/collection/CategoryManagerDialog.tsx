/**
 * 藏 · 分类管理弹层（用途分类 / 介质，两个维度分开管理）
 *
 * 两个维度刻意**不共用一份数据**：共用会让界面出现两个都叫「小说」的下拉，
 * 用户无法理解区别（当初专门拆开的原因，见 services/categories.ts）。
 * 但它们的**管理方式完全一样**（增 / 删 / 恢复默认 + 各条目数），所以合并在一个弹层里
 * 用分段切换，而不是并排两个几乎相同的「+」入口 —— 后者会让人分不清哪个管哪个。
 *
 * 2026-09-21：介质由固定枚举改为 categories 表数据（scope `collection_medium`），
 * 因此与用途分类一道进本弹层管理。
 */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Dialog, Input } from '../../components/ui'
import type { CollectionItem } from '../../types/entities'
import { cn } from '../../utils/cn'

export function CategoryManagerDialog({
  open,
  onClose,
  categories,
  items,
  draft,
  onDraft,
  onAdd,
  onRemove,
  onReset,
  mediums,
  mediumDraft,
  onMediumDraft,
  onAddMedium,
  onRemoveMedium,
  onResetMediums,
}: {
  open: boolean
  onClose: () => void
  /** 用途分类（items.category） */
  categories: string[]
  items: CollectionItem[]
  draft: string
  onDraft: (v: string) => void
  onAdd: () => void
  onRemove: (name: string) => void
  onReset: () => void
  /** 介质（items.type） */
  mediums: string[]
  mediumDraft: string
  onMediumDraft: (v: string) => void
  onAddMedium: () => void
  onRemoveMedium: (name: string) => void
  onResetMediums: () => void
}) {
  const [tab, setTab] = useState<'category' | 'medium'>('category')
  const isCat = tab === 'category'
  const list = isCat ? categories : mediums
  const countOf = (name: string) =>
    isCat
      ? name === '其他'
        ? items.filter((it) => !it.category || !categories.includes(it.category)).length
        : items.filter((it) => it.category === name).length
      : items.filter((it) => it.type === name).length

  return (
    <Dialog open={open} onClose={onClose} title="管理藏阁分类">
      <div className="space-y-3">
        {/* 分段切换：两个维度管理方式一样，但数据完全独立 */}
        <div className="switch-pill inline-flex gap-1 rounded-tile p-0.5">
          {([['category', '用途分类'], ['medium', '介质']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={cn(
                'whitespace-nowrap rounded-control px-3 py-1 text-sm transition-colors',
                tab === v ? 'switch-pill-active' : 'text-ink-muted hover:text-ink',
              )}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {list.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink-soft"
            >
              {c}
              <span className="tabular text-xs text-ink-faint">{countOf(c)}</span>
              <button
                onClick={() => (isCat ? onRemove(c) : onRemoveMedium(c))}
                className="text-ink-faint transition-colors hover:text-cinnabar"
                aria-label={`移除 ${c}`}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            autoFocus
            value={isCat ? draft : mediumDraft}
            onChange={(e) => (isCat ? onDraft(e.target.value) : onMediumDraft(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && (isCat ? onAdd() : onAddMedium())}
            placeholder={isCat ? '新增分类名…' : '新增介质名…'}
            className="max-w-[200px]"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (isCat ? onAdd() : onAddMedium())}
            disabled={!(isCat ? draft : mediumDraft).trim()}
          >
            <Plus size={13} /> 添加
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <p className="text-xs text-ink-faint">
            {isCat ? '移除分类不删条目，相关条目归入「其他」' : '移除介质不删条目，条目仍显示原介质名'}
          </p>
          <Button size="sm" variant="tertiary" onClick={isCat ? onReset : onResetMediums}>
            恢复默认
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
