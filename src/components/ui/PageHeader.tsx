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
    <div className={cn('flex flex-wrap items-end justify-between gap-3 pb-4 md:pb-5', className)}>
      <div>
        {/* 窄屏收到 2xl：3xl 的书法字在 375px 上要占掉近半屏高，而页头只是路由标识 */}
        <h1 className="scribal-title text-2xl text-ink-bright md:text-3xl">{title}</h1>
        {poem && <p className="scribal mt-1 text-sm text-ink-muted md:mt-1.5 md:text-base">{poem}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
