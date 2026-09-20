/**
 * Dialog —— 居中弹窗
 *
 * a11y 契约（Esc / 遮罩点击 / Tab 锁 / 焦点进出）由 useModalLayer 与
 * OverlayScrim 提供，与 Sheet、Inspector 同一套实现。
 * 本组件只保留「居中」这一差异：定位容器、面板宽度与圆角。
 */
import { X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'
import { Button } from './Button'
import { OverlayScrim } from './OverlayScrim'
import { useModalLayer } from './overlay'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** 底部操作区 */
  footer?: ReactNode
  className?: string
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useModalLayer({ open, onClose })

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center p-4">
      <OverlayScrim onClose={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'talisman overlay-panel relative w-full max-w-md p-5 shadow-overlay anim-enter max-h-[85vh] overflow-y-auto focus:outline-none',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="scribal-title text-xl text-ink">{title}</h3>
          <Button
            variant="tertiary"
            size="sm"
            onClick={onClose}
            aria-label="关闭"
            className="!px-1.5"
          >
            <X size={16} />
          </Button>
        </div>
        <div>{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
