/**
 * Timeline —— 时间线（今日轨迹/成长）
 * 时间为主视觉：左列时刻 + 标题 + 详情
 */
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface TimelineItem {
  id: string
  time?: string
  title: ReactNode
  detail?: ReactNode
  /** 节点类型 */
  tone?: 'plain' | 'cinnabar' | 'bronze' | 'teal'
}

export interface TimelineProps {
  items: TimelineItem[]
  className?: string
}

const dotTone: Record<NonNullable<TimelineItem['tone']>, string> = {
  plain: 'bg-line-strong',
  cinnabar: 'bg-cinnabar',
  bronze: 'bg-bronze',
  teal: 'bg-teal',
}

export function Timeline({ items, className }: TimelineProps) {
  if (items.length === 0) return null
  return (
    <ol className={cn('relative ml-1 border-l border-line', className)}>
      {items.map((it) => (
        <li key={it.id} className="relative flex gap-3 pb-4 pl-4 last:pb-0">
          <span
            className={cn(
              'absolute left-0 top-[8px] h-2 w-2 -translate-x-1/2 rotate-45',
              dotTone[it.tone ?? 'plain'],
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              {it.time && (
                <span className="tabular text-xs text-ink-faint">{it.time}</span>
              )}
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">{it.title}</span>
            </div>
            {it.detail && (
              <div className="mt-0.5 text-[13px] text-ink-muted">{it.detail}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
