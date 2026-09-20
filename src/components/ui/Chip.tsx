/**
 * Chip —— 筛选药丸（分类 / 状态筛选的统一形制）
 *
 * 此前各处各写一套：藏品中心是 `px-3 py-1.5 text-sm`，项目中心是 `px-2.5 py-1 text-xs`，
 * 同一类按钮大小不一，并排看很突兀。这里定为唯一标准：
 *  · 尺寸 `px-3 py-1.5`（触屏可点，视觉高度约 34px，低于此值手指容易点空）
 *  · 字号 `text-sm`、圆角 `rounded-tile`
 *  · 选中 `bg-ink text-on-dark`，未选 `bg-raised text-ink-muted hover:text-ink`
 * 计数用等宽数字 + 60% 透明，避免数字位数变化时按钮宽度跳动。
 *
 * `data-active` 由组件自身输出，配合 `ScrollRow` 的 activeSelector 自动居中。
 */
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface ChipProps {
  /** 是否选中 */
  active?: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
}

export function Chip({ active = false, children, onClick, className }: ChipProps) {
  return (
    <button
      type="button"
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}
