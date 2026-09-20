/**
 * 天机 · 头部
 * 单行「名称 + 状态徽标」—— 状态改用既有 Badge 形制，省掉第二行说明小字
 * （面板打开时第一眼要看到的是"天机能不能干活"），完整解释挂在 title 上。
 *
 * 状态是**三态**而不是"配没配"：远程配了但调用失败时必须说出来。
 * 此前失败被静默兜底，用户只感觉到「天机变笨了」，却看不到任何提示。
 */
import { Bot, RotateCcw, X } from 'lucide-react'
import { Badge } from '../ui'
import type { AiRemoteHealth } from '../../services/ai/health'

/** 三态 → 徽标外观与说法。reason 只进 title，不占标题行的宽度 */
const PRESENTATION: Record<
  AiRemoteHealth['state'],
  { tone: 'teal' | 'plain' | 'cinnabar'; label: string; title: string }
> = {
  ready: {
    tone: 'teal',
    label: '远程就绪',
    title: '已接入远程 AI：可自由提问，也能点下方能力卡片一键生成',
  },
  degraded: {
    tone: 'cinnabar',
    label: '远程异常',
    title: '',
  },
  unconfigured: {
    tone: 'plain',
    label: '本地规则',
    title: '未配置远程 AI：当前回答来自本地规则概览，可在「系统 · AI Core」接入',
  },
}

export function ChatHeader({
  remote,
  onNewChat,
  onClose,
}: {
  remote: AiRemoteHealth
  onNewChat: () => void
  onClose: () => void
}) {
  const p = PRESENTATION[remote.state]
  // 降级时把具体原因摊开说：用户据此才知道该改 Key、查额度还是查网络
  const title =
    remote.state === 'degraded'
      ? `远程 AI 调用失败，已退回本地规则结果${remote.reason ? `：${remote.reason}` : ''}\n再问一次可重试；持续失败请检查「系统 · AI Core」的 Key、额度与 Base URL`
      : p.title

  return (
    <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal/12 text-teal">
        <Bot size={15} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="display shrink-0 text-sm font-semibold text-ink">天机</span>
        <Badge tone={p.tone} title={title}>
          {p.label}
        </Badge>
      </div>
      {/* 图标按钮给到 36px：28px 在手机上偏小（手指点空就关不掉/清不掉） */}
      <button
        onClick={onNewChat}
        aria-label="新对话"
        title="清空并开始新对话"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-raised hover:text-ink"
      >
        <RotateCcw size={15} />
      </button>
      <button
        onClick={onClose}
        aria-label="关闭天机"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-raised hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  )
}
