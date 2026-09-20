/**
 * 藏 · AI 整理预览弹窗（确认后才写入）
 */
import { Button, Dialog } from '../../components/ui'
import type { TidySuggestion } from './shared'

export function TidyDialog({
  tidy,
  onClose,
  onApply,
}: {
  tidy: TidySuggestion | null
  onClose: () => void
  onApply: () => void
}) {
  return (
    <Dialog
      open={tidy != null}
      onClose={onClose}
      title="AI 整理 · 预览"
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onApply}>确认应用</Button>
        </>
      }
    >
      {tidy && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-ink-faint">简介</div>
            <p className="rounded-tile border border-line px-3 py-2 text-sm text-ink-soft">{tidy.description}</p>
          </div>
          <div>
            <div className="mb-1 text-xs text-ink-faint">标签</div>
            <p className="rounded-tile border border-line px-3 py-2 text-sm text-ink">{tidy.tags.join('、')}</p>
          </div>
          <div>
            <div className="mb-1 text-xs text-ink-faint">收藏原因</div>
            <p className="rounded-tile border border-line px-3 py-2 text-sm text-ink-muted">{tidy.reason}</p>
          </div>
          <p className="text-xs text-ink-faint">写入前请确认：AI 仅生成建议，可自行修改。</p>
        </div>
      )}
    </Dialog>
  )
}
