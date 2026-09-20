/**
 * 术 · 类型管理弹窗（全部类型含播种的内置 7 类都可删、可改名）
 */
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Dialog, Input } from '../../components/ui'

export function TypeManagerDialog({
  open,
  onClose,
  types,
  countOf,
  renaming,
  renameDraft,
  draft,
  onStartRename,
  onRenameDraft,
  onConfirmRename,
  onCancelRename,
  onRemove,
  onDraft,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  types: string[]
  countOf: (t: string) => number
  /** 正在改名的类型名（null 表示没有） */
  renaming: string | null
  renameDraft: string
  draft: string
  onStartRename: (t: string) => void
  onRenameDraft: (v: string) => void
  onConfirmRename: (from: string) => void
  onCancelRename: () => void
  onRemove: (t: string) => void
  onDraft: (v: string) => void
  onAdd: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="管理术库类型">
      <div className="space-y-3">
        <div className="space-y-1.5">
          {types.map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              {renaming === t ? (
                <>
                  <Input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => onRenameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onConfirmRename(t)}
                    className="min-w-0 flex-1"
                  />
                  <Button size="sm" variant="secondary" onClick={() => onConfirmRename(t)}>确定</Button>
                  <Button size="sm" variant="tertiary" onClick={onCancelRename}>取消</Button>
                </>
              ) : (
                <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink-soft">
                  <span className="min-w-0 flex-1 truncate">{t}</span>
                  <span className="tabular text-xs text-ink-faint">{countOf(t)}</span>
                  <button
                    onClick={() => onStartRename(t)}
                    className="p-0.5 text-ink-faint transition-colors hover:text-ink"
                    aria-label={`重命名 ${t}`}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => onRemove(t)}
                    className="p-0.5 text-ink-faint transition-colors hover:text-cinnabar"
                    aria-label={`删除 ${t}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              )}
            </div>
          ))}
          {types.length === 0 && <p className="text-xs text-ink-faint">还没有类型，先在下面添加</p>}
        </div>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            placeholder="新增类型名…"
            className="min-w-0 flex-1"
          />
          <Button size="sm" variant="secondary" onClick={onAdd} disabled={!draft.trim()}>
            <Plus size={13} /> 添加
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-ink-faint">
          删除类型不删能力，相关条目仍在「全部」可见；改名会同步迁移所属能力。
        </p>
      </div>
    </Dialog>
  )
}
