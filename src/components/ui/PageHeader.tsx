/**
 * PageHeader —— 页面统一页头（书法大标题 + 引首诗句 + 操作）
 * 去除英文副标签与功能列表，改为一句贴合板块的小古诗（题跋）
 */
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface PageHeaderProps {
  /** 引首诗句（小书法，替代原英文副标签与功能列表） */
  poem?: string
  title: ReactNode
  action?: ReactNode
  className?: string
}

export function PageHeader({ poem, title, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3 pb-5', className)}>
      <div>
        <h1 className="scribal-title text-3xl text-ink-bright">{title}</h1>
        {poem && <p className="mt-1.5 scribal text-base text-ink-muted">{poem}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
