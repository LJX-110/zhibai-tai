/**
 * Sheet —— 底部弹层（移动端友好，safe-area 感知）
 *
 * Esc / 遮罩点击 / Tab 锁 / 焦点进出与 Dialog 共用 useModalLayer；
 * 本组件只保留「贴底」这一差异：定位、上滑入场、底部安全区内边距。
 */
import { X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'
import { Button } from './Button'
import { OverlayScrim } from './OverlayScrim'
import { useModalLayer } from './overlay'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** sidebar：黛蓝/绛红抽屉（移动端「更多空间」与桌面侧栏同语言） */
  tone?: 'paper' | 'sidebar'
}

export function Sheet({ open, onClose, title, children, footer, className, tone = 'paper' }: SheetProps) {
  const titleId = useId()
  const panelRef = useModalLayer({ open, onClose })

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)]">
      <OverlayScrim onClose={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'talisman overlay-panel overlay-panel--edge absolute inset-x-0 bottom-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-overlay anim-sheet max-h-[88vh] overflow-y-auto focus:outline-none',
          tone === 'sidebar' && 'sheet-sidebar',
          className,
        )}
      >
        <div className={cn('mx-auto mb-3 h-1 w-10 rounded-full', tone === 'sidebar' ? 'bg-white/25' : 'bg-line-strong')} />
        <div className="mb-3 flex items-center justify-between">
          <h3 id={titleId} className={cn('scribal-title text-xl', tone === 'sidebar' ? 'text-on-sidebar' : 'text-ink')}>{title}</h3>
          <Button variant="tertiary" size="sm" onClick={onClose} aria-label="关闭" className={cn('!px-1.5', tone === 'sidebar' && 'text-on-sidebar-muted hover:bg-white/10 hover:text-on-sidebar')}>
            <X size={16} />
          </Button>
        </div>
        <div>{children}</div>
        {footer && (
          <div className={cn('flex justify-end gap-2 mt-5 pt-4 border-t', tone === 'sidebar' ? 'border-white/10' : 'border-line')}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
