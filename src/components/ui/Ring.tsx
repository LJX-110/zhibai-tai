/**
 * Ring —— 环形进度（今日炁象 / 达标等）
 */
import { cn } from '../../utils/cn'

export interface RingProps {
  /** 0-100 */
  percent: number
  size?: number
  stroke?: number
  className?: string
  children?: React.ReactNode
}

export function Ring({ percent, size = 88, stroke = 6, className, children }: RingProps) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-nested)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-cinnabar)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      {/* 进度环不做补间动画：`stroke-dashoffset` 是绘制属性动画（同 width 一类），
          不满足「动画只动 transform / opacity」的硬规则（2026-09-28）。
          数值变化直接落定；值只在数据变化时改，不会自己跑。 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}
