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
      {/* 用 scaleX 而不是 width 做动画：width 每帧触发布局重算，
          本项目只允许 transform / opacity 参与动画（见编码规范 §4.6） */}
      <div
        className={cn(
          'h-full w-full origin-left rounded-full transition-transform duration-slow',
          bronze ? 'bg-bronze' : 'bg-cinnabar',
        )}
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  )
}
