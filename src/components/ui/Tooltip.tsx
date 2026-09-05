/**
 * Tooltip —— 轻量提示（title 实现，克制）
 */
import { cn } from '../../utils/cn'

export interface TooltipProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function Tooltip({ label, children, className }: TooltipProps) {
  return (
    <span className={cn('relative group inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs text-on-dark opacity-0 shadow-float transition-opacity duration-fast group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}
