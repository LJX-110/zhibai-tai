/**
 * 情 · 分类管理弹层（就地增删）
 * 移除不影响已有情报，仅收起页签。
 */
import { Plus, Settings2, Trash2 } from 'lucide-react'
import { Button, Dialog, Input } from '../../components/ui'

export function CategoryDialog({
  open,
  onClose,
  categories,
  draft,
  onDraft,
  onAdd,
  onRemove,
  onReset,
}: {
  open: boolean
  onClose: () => void
  categories: string[]
  draft: string
  onDraft: (v: string) => void
  onAdd: () => void
  onRemove: (name: string) => void
  onReset: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="管理情报分类">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink-soft"
            >
              {c}
              <button
                onClick={() => onRemove(c)}
                className="text-ink-faint transition-colors hover:text-cinnabar"
                aria-label={`移除 ${c}`}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
          {categories.length === 0 && (
            <span className="text-xs text-ink-faint">暂无自定义分类，情报将全部归入「其他」</span>
          )}
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
          <p className="text-xs text-ink-faint">新增后可作为情报源的分类与筛选页签</p>
          <Button size="sm" variant="tertiary" onClick={onReset}>
            <Settings2 size={13} /> 恢复默认
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
