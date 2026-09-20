/**
 * 天机 · 输入区
 * 生成中把发送键换成「停止」：流式回答可能很长，要能随时打断而不是干等。
 */
import { CornerDownLeft, Send, Square } from 'lucide-react'
import type { AiRemoteHealth } from '../../services/ai/health'

export function ChatInput({
  input,
  onInput,
  onSend,
  onStop,
  busy,
  remote,
}: {
  input: string
  onInput: (v: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  remote: AiRemoteHealth
}) {
  // 降级的提示语要和"未配置"区分开：一个该去改配置，一个只需再试一次
  const placeholder =
    remote.state === 'ready'
      ? '输入问题，回车发送…'
      : remote.state === 'degraded'
        ? '远程暂时不可用，可再问一次重试…'
        : '输入问题…'
  return (
    <div className="flex items-center gap-2 border-t border-line px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]">
      {/* 给输入框一层实体边界：原来只有一条裸输入线，看不出"这里能打字"。
          桌面 14px / 手机由 index.css 强制 16px（防 iOS 聚焦缩放） */}
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-raised px-2.5 py-1.5 transition-colors focus-within:border-line-strong">
        <CornerDownLeft size={13} className="shrink-0 text-ink-faint" />
        <input
          autoFocus
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      {/* 生成中显示「停止」：流式回答可能很长，要能随时打断而不是干等 */}
      {busy ? (
        <button
          onClick={onStop}
          aria-label="停止生成"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-ink-muted transition-colors hover:text-cinnabar"
        >
          <Square size={12} />
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={!input.trim()}
          aria-label="发送"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-on-sidebar transition-opacity disabled:opacity-35"
        >
          <Send size={14} />
        </button>
      )}
    </div>
  )
}
