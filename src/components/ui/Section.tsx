/**
 * Section —— 分区标题（避免满屏卡片，以分区+分隔线组织页面）
 */
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface SectionProps {
  /** 可省略：嵌在折叠层里时，外层已有标题，内层再写一遍就是重复 */
  title?: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function Section({ title, hint, action, className, children }: SectionProps) {
  return (
    // 分区间距走 --section-gap 令牌（tokens.css），替代各页手写 margin
    <section className={cn('pb-[var(--section-gap)] first:pt-0', className)}>
      <div className="section-title">
        {/* 无标题时不渲染空 span —— 否则标题行会留一段多余的空白高度 */}
        {title ? <span>{title}</span> : null}
        {/* 移动端藏掉右侧提示语：窄屏上标题行本就是最拥挤的一行，
            这类说明属于「看得懂但没必要」的噪音 */}
        {hint && <span className="hint max-md:hidden">{hint}</span>}
        {/* 用 div 而非 span 包 action：action 可能是块级容器（如「学」「奇」的管理按钮组），
            用 div 语义更准确。注：span 在 flex 容器里会被块化、原先也能正常靠右 ——
            这里改的是语义，不是修 bug。 */}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="pt-1">{children}</div>
    </section>
  )
}
