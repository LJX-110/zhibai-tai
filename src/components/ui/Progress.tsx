/**
 * Progress —— 横向进度条
 */
import { cn } from '../../utils/cn'

export interface ProgressProps {
  value: number
  max?: number
  className?: string
  /** 铜金高亮（完成/仪式） */
  bronze?: boolean
}

export function Progress({ value, max = 100, className, bronze }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-nested', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-slow var(--ease-standard)',
          bronze ? 'bg-bronze' : 'bg-cinnabar',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
