/**
 * Collapse —— 低频内容的分层容器（默认收起）
 *
 * 为什么要有它：手机上设置页是一张极长的清单，想改一项得先翻过好几屏
 * 用不到的配置。解法不是删掉低频项，而是把它们收进一个整行可点的标题里，
 * 首屏只承担高频项 —— 需要时一次点击就能展开，功能一个不少。
 *
 * 状态只存在组件内部，不落 store / localStorage：收起只是「进入页面时的
 * 默认视野」，不是用户偏好；持久化反而会让自认为「设置丢了」的误判出现。
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface CollapseProps {
  title: ReactNode
  /**
   * 补充说明。与 Section 的 hint 不同，这里**移动端也显示**：
   * 收起时这行字是「里面装了什么」的唯一线索，藏掉它等于让折叠区变成黑箱。
   * 因此调用方请务必写短（4-6 字），别让它把标题行挤到换行。
   */
  hint?: ReactNode
  /** 非受控初始态；受控时请用 open 传入 */
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  children: ReactNode
}

export function Collapse({
  title,
  hint,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  children,
}: CollapseProps) {
  const [inner, setInner] = useState(defaultOpen)
  // open 一旦传入即视为受控：内部 state 不再参与取值，避免两种来源打架
  const expanded = open ?? inner

  const toggle = () => {
    if (open === undefined) setInner(!expanded)
    onOpenChange?.(!expanded)
  }

  return (
    <section className={cn('pb-[var(--section-gap)] first:pt-0', className)}>
      {/* 整行可点：375px 上手指落点不能只有那个小三角 */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="section-title w-full cursor-pointer text-left"
      >
        {/* 三角而非箭头符号：收起态朝右、展开态朝下，是可点开的通用暗示 */}
        <ChevronDown
          size={15}
          aria-hidden
          className={cn(
            'self-center shrink-0 text-ink-muted transition-transform duration-med',
            !expanded && '-rotate-90',
          )}
        />
        <span>{title}</span>
        {hint && <span className="hint">{hint}</span>}
        <span className="ml-auto text-[11px] font-normal text-ink-faint">
          {expanded ? '收起' : '展开'}
        </span>
      </button>
      {expanded && <div className="pt-1">{children}</div>}
    </section>
  )
}
