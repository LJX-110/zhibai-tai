/**
 * ScrollRow —— 横向滚动行（窄屏必备的可发现性）
 *
 * 横向滚动在手机上是「看不见的能力」：没有滚动条、没有渐隐，
 * 用户不知道右边还有内容，于是「页签不全 / 按钮点不到」。
 * 这里统一补两件事：右缘渐隐（`.scroll-fade-x` 用 mask 实现，与父容器底色无关）
 * 与选中项自动居中，避免切换后还要手动横滑找当前位置。
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface ScrollRowProps {
  children: ReactNode
  className?: string
  /** 选中项的 CSS 选择器（如 `[data-active="true"]`）；给了才会自动居中 */
  activeSelector?: string
  /** 选中值；变化时重新居中 */
  activeKey?: string | number | null
  /** 关闭右缘渐隐（例如外层已有自己的视觉处理） */
  noFade?: boolean
}

export function ScrollRow({
  children,
  className,
  activeSelector,
  activeKey,
  noFade,
}: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeSelector) return
    const el = ref.current?.querySelector<HTMLElement>(activeSelector)
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeSelector, activeKey])

  return (
    <div
      ref={ref}
      className={cn(
        'no-scrollbar flex items-center gap-1.5 overflow-x-auto',
        !noFade && 'scroll-fade-x',
        className,
      )}
    >
      {children}
    </div>
  )
}
