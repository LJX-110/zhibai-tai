/**
 * 奇 · AI 解卦弹窗（梅花与大衍共用）
 * 只负责展示，解释正文由调用方取回后传入。
 */
import { Button, Dialog } from '../../components/ui'

export function ExplainDialog({
  explain,
  onClose,
}: {
  explain: { title: string; body: string } | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={explain != null}
      onClose={onClose}
      title={explain?.title ?? ''}
      footer={<Button variant="primary" onClick={onClose}>知道了</Button>}
    >
      <pre className="whitespace-pre-wrap rounded-tile border border-line bg-paper/70 p-4 font-sans text-sm leading-relaxed text-ink-soft">
        {explain?.body}
      </pre>
      <p className="mt-2 text-xs text-ink-faint">AI 仅解释结构，卦象由算法生成，不由 AI 决定。</p>
    </Dialog>
  )
}
