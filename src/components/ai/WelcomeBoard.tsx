/**
 * 天机 · 空会话看板：实时状态（各板块脉搏）+ 能力胶囊 + 快捷问句。
 * 管家先亮出"我已经看到什么"，再给一键动作 —— 不堆 2×2 大卡占屏。
 *
 * 布局取舍（用户反馈过"占位过大、过于简陋"，后又指出空态下方一大片空白最刺眼）：
 * · 内容贴顶、输入贴底，中间不留空洞 —— 看板用 min-h-full 撑满消息区，
 *   把"可以这样问"+模式说明用 mt-auto 锚到输入框正上方，空白变成段落间距而非死洞；
 * · 脉搏格「标签+数值」同一行，空值统一为 faint 的"—"，一眼扫出今天哪些板块有事；
 * · 胶囊定高横滚，不靠缩小字号换密度。
 */
import { Sparkles } from 'lucide-react'
import { ScrollRow } from '../ui'
import { useTaskStore } from '../../stores/useTaskStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { useTodayStats } from '../../hooks/useTodayStats'
import { todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'
import { TIANJI_CAPABILITIES, type TianjiCapabilityKey } from './tianji-capability'
import type { AiRemoteHealth } from '../../services/ai/health'

export function WelcomeBoard({
  stats,
  remote,
  onPick,
  onRunCap,
}: {
  stats: ReturnType<typeof useTodayStats>
  /** 远程状态三态：未就绪与**降级**要分开说 —— "为什么天机答得浅"与
   *  "远程本来好好的怎么变浅了"是两回事，一句通用说明会让后者被当成能力上限 */
  remote: AiRemoteHealth
  onPick: (q: string) => void
  onRunCap: (key: TianjiCapabilityKey) => void
}) {
  const today = todayISO()
  const tasks = useTaskStore((s) => s.items)
  const items = useIntelligenceStore((s) => s.items)
  const fins = useFinanceStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)

  const openCount = tasks.filter((t) => !t.done).length
  const dueSoon = tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= today).length
  const unreadIntel = items.filter((it) => !it.read).length
  const month = today.slice(0, 7)
  const expense = fins
    .filter((f) => f.kind === 'expense' && f.date.startsWith(month))
    .reduce((s, f) => s + f.amount, 0)

  // 脉搏：值有内容才上色，空值统一走 faint 的"—"——"清空/无/未设/—"四种说法
  // 都是"这里没东西"，统一成一个占位反而一眼能扫出今天哪些板块真的有事。
  const pulse: { label: string; value: string; tone: 'cinnabar' | 'teal' | 'bronze' | 'plain' }[] = [
    { label: '待办', value: openCount > 0 ? `${openCount} 项` : '—', tone: openCount > 0 ? 'cinnabar' : 'plain' },
    { label: '近日到期', value: dueSoon > 0 ? `${dueSoon} 项` : '—', tone: dueSoon > 0 ? 'cinnabar' : 'plain' },
    { label: '课程', value: courses.length > 0 ? `${courses.length} 门` : '—', tone: courses.length > 0 ? 'teal' : 'plain' },
    { label: '情报未读', value: unreadIntel > 0 ? `${unreadIntel} 条` : '—', tone: unreadIntel > 0 ? 'bronze' : 'plain' },
    { label: '本月支出', value: expense > 0 ? `¥${Math.round(expense).toLocaleString()}` : '—', tone: expense > 0 ? 'bronze' : 'plain' },
    { label: '今日专注', value: stats.focusMinutes > 0 ? `${stats.focusMinutes}m` : '—', tone: stats.focusMinutes > 0 ? 'teal' : 'plain' },
  ]

  // 看板要回答的第一个问题是"今天"——日期摆在最前面，用户不用去想今天是几号
  const d = new Date()
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`

  return (
    // 空态看板要让"今天有什么"一眼可见，且占满消息区高度：顶部放日期+脉搏+能力
    // （核心信息），底部用 mt-auto 把"可以这样问"+模式说明锚到输入框正上方 —— 空白
    // 从"中间开洞"变成"段落间的呼吸"，输入区自然贴底，手机全屏 / 桌面卡片两种形态都成立。
    <div className="flex min-h-full flex-col">
      {/* 日期单独成行：模式状态已收进头部 Badge，这里不再重复"本地规则模式"
          那行小字（避免和徽标说同一件事，也少一行冗余） */}
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Sparkles size={13} className="shrink-0 text-bronze" />
          今日 · {dateLabel}
        </span>
      </div>

      {/* 各板块脉搏：内容驱动的胶囊（不是固定列宽网格）—— 窄屏上"本月支出 ¥12,345"
          会撞上 3 列格子的宽度，固定列宽只能截断；让它自己换行则永远不会截字。
          值只在"有事要做"时上色，空值统一 faint 的"—"，一眼扫出今天该看哪几个 */}
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {pulse.map((p) => (
          <span
            key={p.label}
            className="inline-flex items-baseline gap-1.5 rounded-tile border border-line bg-paper/60 px-2 py-1"
          >
            <span className="text-xs text-ink-faint">{p.label}</span>
            <span
              className={cn(
                'tabular text-sm font-medium',
                p.tone === 'cinnabar'
                  ? 'text-cinnabar'
                  : p.tone === 'teal'
                    ? 'text-teal'
                    : p.tone === 'bronze'
                      ? 'text-bronze'
                      : 'text-ink-faint',
              )}
            >
              {p.value}
            </span>
          </span>
        ))}
      </div>

      {/* 能力胶囊：一行横滚（右缘渐隐提示还有内容）。
          只留能力名 —— 下方小字说明已按反馈移除，胶囊随之从「定宽定高两行」
          收敛为单行自适应，行高从 52px 降到 36px（与按钮触控下限一致） */}
      <div className="mb-2 text-xs tracking-[0.18em] text-ink-faint">一键能力</div>
      {/* 负边距 + 内补白：让胶囊能滑到屏幕边缘，同时首项仍与上方内容对齐 */}
      <ScrollRow className="-mx-4 mb-3.5 px-4">
        {TIANJI_CAPABILITIES.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.key}
              onClick={() => onRunCap(c.key)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-tile border border-line bg-paper/70 px-3 text-sm text-ink transition-colors hover:border-teal/40"
            >
              <Icon size={13} className="shrink-0 text-ink-faint" />
              {c.label}
            </button>
          )
        })}
      </ScrollRow>

      {/* 底部锚定组：mt-auto 把"可以这样问"+模式说明压到输入框正上方。
          上方内容再短，空白也只落在两段之间，不会在中间戳出空洞；
          问句按钮紧贴输入框，点一下即填入并发送，符合"在这儿问"的直觉。 */}
      <div className="mt-auto">
        {/* 快捷问句：空输入框不会自己教用户怎么问，把"能问什么"摆到明面上 */}
        <div className="mb-2 text-xs tracking-[0.18em] text-ink-faint">可以这样问</div>
        <div className="flex flex-wrap gap-1.5">
          {['我今天还有哪些事？', '这月花了多少钱？', '最近在关注什么？', '帮我规划今天下午'].map((h) => (
            <button
              key={h}
              onClick={() => onPick(h)}
              className="rounded-tile border border-line bg-raised px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {h}
            </button>
          ))}
        </div>

        {/* 远程不可用时一句带过出路：原来那段长说明已删（与头部 Badge 重复），
            这里只留一行最关键的"下一步做什么"，作页脚而非中段说明，信息降权。
            降级与未配置分成两句 —— 前者的下一步是「再试一次 / 查额度」，
            后者才是「去填配置」，混成一句会把已经配好的用户指错方向 */}
        {remote.state === 'degraded' && (
          <p className="mt-3 text-xs leading-relaxed text-cinnabar/80">
            远程 AI 暂时不可用{remote.reason ? `（${remote.reason}）` : ''} · 当前为本地规则概览。
            再问一次可重试；持续失败请检查「系统 · AI Core」的 Key、额度与 Base URL。
          </p>
        )}
        {remote.state === 'unconfigured' && (
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            未接入远程 AI · 在「系统 · AI Core」填好 Base URL / 模型 / Key，天机才能结合你的数据作答。
          </p>
        )}
      </div>
    </div>
  )
}
