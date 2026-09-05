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
    <section className={cn('py-4 first:pt-0', className)}>
      <div className="section-title">
        <span>{title}</span>
        {hint && <span className="hint">{hint}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="pt-1">{children}</div>
    </section>
  )
}
