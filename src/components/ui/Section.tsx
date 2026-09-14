/**
 * Section —— 分区标题（避免满屏卡片，以分区+分隔线组织页面）
 */
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface SectionProps {
  title: ReactNode
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
        <span>{title}</span>
        {/* 移动端藏掉右侧提示语：窄屏上标题行本就是最拥挤的一行，
            这类说明属于「看得懂但没必要」的噪音 */}
        {hint && <span className="hint max-md:hidden">{hint}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="pt-1">{children}</div>
    </section>
  )
}
