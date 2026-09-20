/**
 * 藏 · 分类管理弹层（与情页同交互：增 / 删 / 恢复默认），并显示各分类条目数
 */
import { Plus, Trash2 } from 'lucide-react'
import { Button, Dialog, Input } from '../../components/ui'
import type { CollectionItem } from '../../types/entities'

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
}: {
  open: boolean
  onClose: () => void
  categories: string[]
  items: CollectionItem[]
  draft: string
  onDraft: (v: string) => void
  onAdd: () => void
  onRemove: (name: string) => void
  onReset: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="管理藏阁分类">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const count =
              c === '其他'
                ? items.filter((it) => !it.category || !categories.includes(it.category)).length
                : items.filter((it) => it.category === c).length
            return (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink-soft"
              >
                {c}
                <span className="tabular text-xs text-ink-faint">{count}</span>
                <button
                  onClick={() => onRemove(c)}
                  className="text-ink-faint transition-colors hover:text-cinnabar"
                  aria-label={`移除 ${c}`}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            placeholder="新增分类名…"
            className="max-w-[200px]"
          />
          <Button size="sm" variant="secondary" onClick={onAdd} disabled={!draft.trim()}>
            <Plus size={13} /> 添加
          </Button>
        </div>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <p className="text-xs text-ink-faint">移除分类不删条目，相关条目归入「其他」</p>
          <Button size="sm" variant="tertiary" onClick={onReset}>
            恢复默认
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
