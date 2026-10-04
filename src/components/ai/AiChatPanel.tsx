/**
 * 天机 —— AI 总调度（全局入口：手机全屏 / 桌面居中卡片）
 *
 * 定位：知白台唯一的 AI 入口。把散落各处的 AI 按钮（今日简报 / 学习计划 /
 * 项目摘要 / 总结情报 / 解卦）收编为「快捷能力」，既可直接自由对话，也可一键
 * 点能力卡片，由天机自动携带本机数据（任务 / 课程 / 情报 / 收支）生成结果。
 *
 * ## 本文件只管"怎么画"
 * 会话怎么进行（发问 / 工具确认 / 续跑 / 落库 / 换新）全在 `use-tianji-chat.ts`；
 * 这里留下的是**面板自己的事**：开关与 Esc、滚动跟随、区块组合。
 * 这样分家的直接原因：Step 4-3 给会话加了确认门之后，两者合在一起会顶破
 * 单文件 400 行的上限，而它们本来就不是同一种职责。
 *
 * 远程未就绪时回退本地规则概述（不假装智能）；远程就绪则完整问答。
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getAiRemoteHealth, subscribeAiRemoteHealth } from '../../services/ai/health'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { cn } from '../../utils/cn'
import { hasActiveOverlay } from '../ui/overlay'
import { useAIChatStore } from './chat-store'
import { useTianjiChat } from './use-tianji-chat'
import { ChatHeader } from './ChatHeader'
import { MessageStream } from './MessageStream'
import { ChatInput } from './ChatInput'
import { AgentProgress } from './AgentProgress'

export function AiChatPanel() {
  const open = useAIChatStore((s) => s.open)
  const setOpen = useAIChatStore((s) => s.setOpen)
  const draft = useAIChatStore((s) => s.draft)
  const chat = useTianjiChat()
  const listRef = useRef<HTMLDivElement>(null)
  /** 是否"贴着底部"：流式增量不断把气泡撑长，只有本来就在底部才跟随滚动，
   *  用户上滑回看前文时不抢滚动位置（否则长回答会被一直拽回结尾） */
  const stickToBottom = useRef(true)

  /**
   * 页面入口（如选课页「AI 建议」）预填的问题：面板打开展示后填入输入框，**不自动发送**。
   * 取后即清（consumeDraft）——否则下次打开面板又会冒出上次的草稿。
   * `setInput` 先取出来（它是 useState 的 setter，身份稳定）：直接写 `chat.setInput`
   * 会让 exhaustive-deps 认为依赖了整个 chat 对象。
   */
  const setChatInput = chat.setInput
  useEffect(() => {
    if (!open || draft === null) return
    setChatInput(draft)
    useAIChatStore.getState().consumeDraft()
  }, [open, draft, setChatInput])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hasActiveOverlay()) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    // 空会话时消息区放的是看板，从头读起；此时贴底会把看板顶出视野
    if (chat.messages.length === 0) return
    // 主动发言/收到回答后必然想看最新一条，重新贴底（之后由用户滚动决定是否继续跟随）
    stickToBottom.current = true
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [chat.messages])

  useEffect(() => {
    if (!chat.streamText || !stickToBottom.current) return
    const el = listRef.current
    el?.scrollTo({ top: el.scrollHeight })
  }, [chat.streamText])

  /**
   * 远程状态 —— 三态而非布尔（未配置 / 就绪 / **降级**）。
   * 订阅式取值：远程调用失败发生在用户提问的过程中，那时组件早就在屏幕上了，
   * 之前的 `useMemo([open])` 只在打开面板时评估一次，降级根本传不下来。
   */
  const remote = useSyncExternalStore(subscribeAiRemoteHealth, getAiRemoteHealth)
  /** 当前远程模型：订阅式取值，设置页改了模型后头部显示同步更新 */
  const aiModel = useSettingsStore((s) => s.aiModel)

  /** 记录用户是否滚到底部（供流式跟随判断） */
  const onListScroll = () => {
    const el = listRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)] flex">
      <div className="absolute inset-0 bg-ink/45" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="天机"
        className={cn(
          'relative flex flex-col bg-paper shadow-overlay anim-enter',
          'w-full h-full',
          'md:my-auto md:mx-auto md:h-[min(72vh,640px)] md:max-w-xl md:rounded-sheet md:border md:border-line',
        )}
      >
        <ChatHeader remote={remote} model={aiModel} onNewChat={chat.newChat} onClose={() => setOpen(false)} />

        {/* 消息流 —— space-y-2.5 管段内节奏，轮次之间靠用户气泡的 mt-2 拉开层级：
            全程等距会让"我的问题"和"天机的回答"糊成一片 */}
        <div
          ref={listRef}
          onScroll={onListScroll}
          className="flex-1 space-y-2.5 overscroll-contain overflow-y-auto px-4 py-3"
        >
          <MessageStream
            messages={chat.messages}
            pendingActions={chat.pendingActions}
            resolved={chat.resolved}
            streamText={chat.streamText}
            busy={chat.busy}
            stats={chat.stats}
            remote={remote}
            onConfirm={chat.confirmAction}
            onSkip={chat.skipAction}
            onRunCap={chat.runCap}
            proposal={chat.proposal}
            onConfirmProposal={chat.confirmProposal}
            onCancelProposal={chat.cancelProposal}
          />
        </div>

        {/* 真实的 Agent 进度（理解任务 → 查待办 → 完成；默认只显示当前一步。
            失败行带「重试」——重发上一问的出口在进度行就地给） */}
        <AgentProgress onRetry={chat.retry} />

        <ChatInput
          input={chat.input}
          onInput={chat.setInput}
          onSend={() => chat.send()}
          onStop={chat.stop}
          busy={chat.busy}
          remote={remote}
        />
      </div>
    </div>,
    document.body,
  )
}
