/**
 * 天机 · 进度行（Step 4-2 · C7 / Step 4-3 · 六；2026-10-02 增重试与已用时）
 *
 * ## 为什么不是"正在思考……"
 * 旧版只有一句占位文案，用户看不出它到底在做什么、卡在哪一步。
 * 现在显示**真实的 Agent 进度**：理解任务 → 查待办 → 完成。
 *
 * ## 形态（移动优先）
 * 默认只有**一行**（不抢输入框的位置）；点一下展开细节（阶段 / 工具 / 起止时间 / 失败原因）。
 *
 * ## 2026-10-02
 *  · **已用时**：进行中每秒刷新（只在这三种进行态挂表，空闲不空转）——
 *    长回答期间"它是不是卡住了"是最高频的疑虑，给一个在动的数字就是答案；
 *    时间取在 effect 的定时器里（`Date.now()` 不进渲染体，项目硬规则），
 *    且随 `startedAt` 配对存放 —— 上一轮的秒数不会串到新一轮。
 *  · **失败时给「重试」**：错误行右侧直接重发上一问（见 `use-tianji-chat` 的 retry）。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { RotateCcw } from 'lucide-react'
import { AGENT_PHASE_LABEL, getAgentStatus, subscribeAgentStatus } from '../../services/agent/status'
import { cn } from '../../utils/cn'

/** 阶段 → 圆点颜色（沿用全站语义：绛红=出问题、黛蓝=进行中、鎏金=等你） */
const DOT: Record<string, string> = {
  thinking: 'bg-skill-indigo',
  working: 'bg-teal',
  waiting: 'bg-gold-btn',
  success: 'bg-teal',
  error: 'bg-cinnabar',
  idle: 'bg-ink-faint',
}

export function AgentProgress({ onRetry }: { onRetry?: () => void }) {
  const status = useSyncExternalStore(subscribeAgentStatus, getAgentStatus)
  const [open, setOpen] = useState(false)
  /** 已用时：`at` 与 `startedAt` 配对 —— 只有属于当前这一轮的秒数才会显示 */
  const [elapsed, setElapsed] = useState<{ at: number; sec: number } | null>(null)
  const running = status.phase === 'thinking' || status.phase === 'working' || status.phase === 'waiting'
  const startedAt = status.startedAt

  useEffect(() => {
    if (!running || startedAt == null) return
    const t = window.setInterval(() => {
      setElapsed({ at: startedAt, sec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) })
    }, 1000)
    return () => window.clearInterval(t)
  }, [running, startedAt])

  if (status.phase === 'idle') return null

  // 优先显示"具体在做什么"；没有具体动作时才退回阶段名（两者绝不拼在一起，见文件头①）
  const line = status.currentTask || AGENT_PHASE_LABEL[status.phase]
  const haveDetail = Boolean(status.currentTool || status.errorMessage || status.startedAt)
  const elapsedText = running && elapsed && elapsed.at === startedAt ? ` · ${elapsed.sec}s` : ''

  return (
    <div className="border-t border-line px-3.5 py-1.5">
      <div className="flex w-full items-center gap-2 text-xs text-ink-muted">
        <button
          type="button"
          onClick={() => haveDetail && setOpen((v) => !v)}
          aria-expanded={haveDetail ? open : undefined}
          className={cn('flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-muted', haveDetail && 'cursor-pointer')}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              DOT[status.phase],
              status.phase === 'thinking' || status.phase === 'working' ? 'animate-pulse' : '',
            )}
          />
          <span className="min-w-0 truncate">{line}</span>
          <span className="tabular ml-auto shrink-0 text-ink-faint">
            {AGENT_PHASE_LABEL[status.phase]}
            {status.step ? ` ${status.step}${status.maxSteps ? `/${status.maxSteps}` : ''}` : ''}
            {elapsedText}
          </span>
        </button>
        {/* 失败出口：一步重发上一问，不必手打（中止是用户动作，不在此列 —— 那是 idle） */}
        {status.phase === 'error' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="link-underline shrink-0 rounded-control px-1 py-0.5 text-bronze hover:text-ink"
          >
            <RotateCcw size={11} className="mr-0.5 inline" />
            重试
          </button>
        )}
      </div>
      {open && haveDetail && (
        <dl className="mt-1 space-y-0.5 pb-1 text-xs text-ink-faint">
          {status.currentTool && (
            <div className="flex gap-2">
              <dt className="shrink-0">工具</dt>
              <dd className="tabular truncate text-ink-muted">{status.currentTool}</dd>
            </div>
          )}
          {status.startedAt && (
            <div className="flex gap-2">
              <dt className="shrink-0">开始</dt>
              <dd className="tabular text-ink-muted">
                {new Date(status.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}
              </dd>
            </div>
          )}
          {status.errorMessage && (
            <div className="flex gap-2">
              <dt className="shrink-0">原因</dt>
              <dd className="min-w-0 break-words text-cinnabar">{status.errorMessage}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}