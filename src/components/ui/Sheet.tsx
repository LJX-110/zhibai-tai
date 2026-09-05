/**
 * Sheet —— 底部弹层（移动端友好，safe-area 感知）
 */
import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'
import { playSound } from '../../services/sound'
import { Button } from './Button'

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
  // 开合伴音（与 Dialog 同语言）
  useEffect(() => {
    if (open) playSound('ui-open')
    return () => {
      if (open) playSound('ui-close')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink/40 animate-[page-fade_120ms_var(--ease-standard)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'talisman absolute inset-x-0 bottom-0 rounded-t-tile border-x-0 border-b-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-overlay animate-[sheet-up_240ms_var(--ease-standard)] max-h-[88vh] overflow-y-auto',
          tone === 'sidebar' && 'sheet-sidebar',
          className,
        )}
      >
        <div className={cn('mx-auto mb-3 h-1 w-10 rounded-full', tone === 'sidebar' ? 'bg-white/25' : 'bg-line-strong')} />
        <div className="mb-3 flex items-center justify-between">
          <h3 className={cn('scribal-title text-xl', tone === 'sidebar' ? 'text-on-sidebar' : 'text-ink')}>{title}</h3>
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
