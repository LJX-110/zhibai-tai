/**
 * 天机 · 消息区内容（空态看板 / 消息气泡 / 流式气泡 / 等待指示）
 * 滚动容器与 ref 留在面板本体（属于面板的副作用），这里只负责"画什么"。
 */
import { Fragment } from 'react'
import { Copy } from 'lucide-react'
import { useTodayStats } from '../../hooks/useTodayStats'
import { useToast } from '../ui/toast-store'
import { cn } from '../../utils/cn'
import { CapabilityRow } from './CapabilityRow'
import { WelcomeBoard } from './WelcomeBoard'
import { ActionConfirmCard } from './action-cards'
import { ToolConfirmCard, type ToolConfirmState } from './tool-confirm'
import { stripActionFences } from './action-text'
import type { AiRemoteHealth } from '../../services/ai/health'
import type { ChatMessage } from './chat-history'
import type { TianjiActionPayload } from './action-protocol'
import type { TianjiCapabilityKey } from './tianji-capability'

/** 待确认的工具提案（挂在最新一条回答之后；只有"需要你确认"的工具会出现） */
export interface PendingToolProposal {
  toolName: string
  /** 工具自己给的一句话"它想做什么" */
  summary: string
  state: ToolConfirmState
}

/** 气泡形制（用户 / AI / 流式三处共用）：
 *  ① 流式增量与定稿必须同宽同字号，否则回答收齐的瞬间会"跳变"；
 *  ② 正文用 text-sm（14px）而非 13px —— 长回答里 13px 在手机上明显偏小。 */
const BUBBLE = 'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed'

/** AI 气泡：浅色主题下 raised 与 paper 同为白色，纯底色等于没有气泡
 *  （长回答就变成一坨悬空白字）；描边沿用面板内已有的「线框 + raised」形制
 *  （预览确认卡片同款），暗色主题下也依旧成立。AI 与流式共用，避免两处漂移。 */
const AI_BUBBLE = cn(BUBBLE, 'max-w-[92%] rounded-bl-sm border border-line bg-raised text-ink')

export function MessageStream({
  messages,
  pendingActions,
  resolved,
  streamText,
  busy,
  stats,
  remote,
  onConfirm,
  onSkip,
  onRunCap,
  proposal,
  onConfirmProposal,
  onCancelProposal,
}: {
  messages: ChatMessage[]
  /** 每条 AI 消息提议的动作（按消息下标索引） */
  pendingActions: Record<number, TianjiActionPayload[]>
  /** 已处理的动作：done=已确认落库，skip=已忽略（隐藏卡片，避免重复写入） */
  resolved: Record<string, 'done' | 'skip'>
  streamText: string
  busy: boolean
  stats: ReturnType<typeof useTodayStats>
  remote: AiRemoteHealth
  onConfirm: (i: number, j: number, a: TianjiActionPayload) => void
  onSkip: (i: number, j: number) => void
  onRunCap: (key: TianjiCapabilityKey) => void
  /** 待确认的工具提案（没有则为 null） */
  proposal: PendingToolProposal | null
  onConfirmProposal: () => void
  onCancelProposal: () => void
}) {
  return (
    <>
      {/* 系统能力（定位/剪贴板）—— 放在**消息流顶部**而不是欢迎页：
          欢迎页只在"没有历史消息"时出现，一有对话这个入口就消失了，
          用户再想授权定位就够不着。这里始终渲染，两种状态都可达。 */}
      <CapabilityRow />

      {/* 消息流 —— 轮次之间靠用户气泡的 mt-2 拉开层级：
          全程等距会让"我的问题"和"天机的回答"糊成一片 */}
      {messages.length === 0 ? (
        <WelcomeBoard stats={stats} remote={remote} onRunCap={onRunCap} />
      ) : (
        messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="mt-2 flex justify-end first:mt-0">
                <div className={cn(BUBBLE, 'max-w-[82%] rounded-br-sm bg-teal text-on-sidebar')}>
                  {m.content}
                </div>
              </div>
            )
          }
          // AI 回答里的动作块剥掉，交给下方预览卡片呈现；纯自然语言才进气泡
          const display = stripActionFences(m.content)
          const showBubble = display.trim().length > 0
          const acts = pendingActions[i] ?? []
          return (
            <Fragment key={m.id}>
              {showBubble && (
                <div className="flex justify-start">
                  {/* AI 回答常带编号与明细，窄气泡会把每行切成两三字；
                      给到 92% 让长回答少折行，用户气泡仍窄，两侧一眼分得清 */}
                  <div className="flex min-w-0 flex-col items-start">
                    <div className={AI_BUBBLE}>{display}</div>
                    {/* 复制出口（2026-10-02）：长回答常要被粘去别处，此前只能手动选中 */}
                    <CopyButton text={display} />
                  </div>
                </div>
              )}
              {acts.map((a, j) => {
                const key = `${i}-${j}`
                const status = resolved[key]
                if (status === 'skip') return null
                return (
                  <div key={key} className="flex justify-start">
                    {/* 与上方气泡同宽，视觉上属于同一条回答 */}
                    <div className="w-[92%]">
                      <ActionConfirmCard
                        a={a}
                        done={status === 'done'}
                        onConfirm={() => onConfirm(i, j, a)}
                        onSkip={() => onSkip(i, j)}
                      />
                    </div>
                  </div>
                )
              })}
            </Fragment>
          )
        })
      )}
      {/* 需确认的工具提案：紧跟在最新一条回答之后（它就是模型"我建议…，等你点一下"的落点）。
          与动作卡片不同，确认后**结果会回喂给模型**继续推理（见 services/agent/loop.ts）。 */}
      {proposal && (
        <div className="flex justify-start">
          <div className="w-[92%]">
            <ToolConfirmCard
              toolName={proposal.toolName}
              summary={proposal.summary}
              state={proposal.state}
              busy={busy}
              onConfirm={onConfirmProposal}
              onCancel={onCancelProposal}
            />
          </div>
        </div>
      )}
      {/* 流式生成中：已有增量就按**与定稿完全相同的样式**先显示（否则生成完会"跳变"），
          还没收到首字节时才显示等待指示 */}
      {busy && streamText && (
        <div className="flex justify-start">
          <div className={AI_BUBBLE}>
            {streamText}
            <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-skill-indigo" />
          </div>
        </div>
      )}
      {busy && !streamText && (
        <div className="flex items-center gap-1.5 px-1 text-xs text-ink-faint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-skill-indigo" />
          天机推演中…
        </div>
      )}
    </>
  )
}

/**
 * 复制一条回答（2026-10-02）。
 * 常显、低对比（移动端没有 hover，藏起来的按钮等于不存在）；
 * 非安全上下文里 `navigator.clipboard` 可能不存在 —— 如实说明，不装成功。
 */
function CopyButton({ text }: { text: string }) {
  const toast = useToast().toast
  return (
    <button
      type="button"
      aria-label="复制这条回答"
      title="复制"
      onClick={() => {
        const clip = navigator.clipboard
        if (!clip) {
          toast('当前环境不支持一键复制 —— 可长按选中文本', 'danger')
          return
        }
        clip
          .writeText(text)
          .then(() => toast('已复制这条回答', 'success'))
          .catch(() => toast('复制失败 —— 可长按选中文本', 'danger'))
      }}
      className="mt-0.5 inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-xs text-ink-faint transition-colors hover:bg-raised hover:text-ink"
    >
      <Copy size={12} /> 复制
    </button>
  )
}
