/**
 * 天机 · **工具确认卡片**（Step 4-3 · 二/三）
 *
 * ## 它与「动作预览卡片」的区别（两张卡长得像，语义不同）
 * | | 动作卡片（`action-cards.tsx`） | 工具确认卡片（本文件） |
 * | --- | --- | --- |
 * | 谁提议 | 模型在回答末尾写动作 JSON | 模型**调用**一个 `requires-confirmation` 工具 |
 * | 结果去处 | 直接落库 | 落库后**结果还要回喂给模型**继续推理 |
 * | 正文来源 | 归属插件的 `preview(fields)` | 工具的 `confirmSummary(args)` |
 *
 * ## 为什么不能只是一段 JSON
 * 用户看到 `{"tool":"memory.save","args":{"text":"..."}}` 是没法决策的 ——
 * 他需要看到"**它想做什么**"这一句人话。所以正文由归属工具用 `confirmSummary` 出，
 * 本文件只做外壳（确认 / 不用两个动作 + 三种状态的外形），**不认识任何具体工具**。
 */
import { CheckCircle2 } from 'lucide-react'

/** 提案卡片的三种状态（`pending` 之外都是终态，不再可点） */
export type ToolConfirmState = 'pending' | 'done' | 'cancelled'

export function ToolConfirmCard({
  toolName,
  summary,
  state,
  onConfirm,
  onCancel,
  busy,
}: {
  /** 工具中文名（如「记住这件事」） */
  toolName: string
  /** 一句话说明它想做什么（由工具自己给，不是通用文案） */
  summary: string
  state: ToolConfirmState
  onConfirm: () => void
  onCancel: () => void
  /** 正在执行（防止连点两次写入两条） */
  busy: boolean
}) {
  if (state !== 'pending') {
    const done = state === 'done'
    return (
      <div className="rounded-tile border border-line bg-raised px-3 py-2.5">
        <div className={`flex items-center gap-1.5 text-sm ${done ? 'text-teal' : 'text-ink-muted'}`}>
          {done ? <CheckCircle2 size={14} /> : null}
          {done ? `${toolName}：已完成` : `${toolName}：已取消，没有写入`}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-tile border border-line bg-raised px-3 py-2.5">
      <div className="mb-1.5 eyebrow text-ink-faint">需要你确认 · {toolName}</div>
      {/* 正文可能较长（一句话事实），用 break-words 而不是截断 */}
      <div className="break-words text-sm text-ink">{summary}</div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex-1 rounded-control bg-teal py-1.5 text-sm font-medium text-on-sidebar transition-opacity active:opacity-80 disabled:opacity-50"
        >
          {busy ? '处理中…' : '确认'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          不用
        </button>
      </div>
    </div>
  )
}
