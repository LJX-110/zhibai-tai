/**
 * 天机 · 进度行（Step 4-2 · C7 / Step 4-3 · 六）
 *
 * ## 为什么不是"正在思考……"
 * 旧版只有一句占位文案，用户看不出它到底在做什么、卡在哪一步。
 * 现在显示**真实的 Agent 进度**：理解任务 → 查待办 → 完成。
 *
 * ## Step 4-3 修掉的两件事
 *  ① **不再重复**：上一版的排版是 `阶段名 · currentTask`，而 `currentTask` 当时也写
 *     "推演中"，于是显示成"推演中 · 推演中"。现在只显示**当前在做什么**这一句
 *     （`currentTask` 由装配层保证是具体动作，见 `agent-run.ts` 的 onEvent）；
 *  ② **失败要说人话**：工具失败时进度行直接写「查待办 未成功」，展开后给真实原因 ——
 *     而不是留一句没有信息量的"好像出了点问题"。
 *
 * ## 形态（移动优先）
 * 默认只有**一行**（不抢输入框的位置）；点一下展开细节（阶段 / 工具 / 起止时间 / 失败原因）。
 */
import { useState, useSyncExternalStore } from 'react'
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

export function AgentProgress() {
  const status = useSyncExternalStore(subscribeAgentStatus, getAgentStatus)
  const [open, setOpen] = useState(false)
  if (status.phase === 'idle') return null

  // 优先显示"具体在做什么"；没有具体动作时才退回阶段名（两者绝不拼在一起，见文件头①）
  const line = status.currentTask || AGENT_PHASE_LABEL[status.phase]
  const haveDetail = Boolean(status.currentTool || status.errorMessage || status.startedAt)

  return (
    <div className="border-t border-line px-3.5 py-1.5">
      <button
        type="button"
        onClick={() => haveDetail && setOpen((v) => !v)}
        aria-expanded={haveDetail ? open : undefined}
        className={cn('flex w-full items-center gap-2 text-xs text-ink-muted', haveDetail && 'cursor-pointer')}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            DOT[status.phase],
            status.phase === 'thinking' || status.phase === 'working' ? 'animate-pulse' : '',
          )}
        />
        <span className="min-w-0 truncate">{line}</span>
        {status.step ? (
          <span className="tabular ml-auto shrink-0 text-ink-faint">
            {AGENT_PHASE_LABEL[status.phase]} {status.step}
            {status.maxSteps ? `/${status.maxSteps}` : ''}
          </span>
        ) : null}
      </button>
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
