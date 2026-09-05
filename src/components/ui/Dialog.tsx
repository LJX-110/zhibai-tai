/**
 * Dialog —— 居中弹窗（桌面端）
 *
 * a11y 契约（P1）：
 *  · Escape / 点击遮罩 / 关闭按钮三种退出方式
 *  · role="dialog" + aria-modal + aria-labelledby（有标题时）
 *  · 打开时焦点移入弹窗（首个可聚焦元素），关闭后归还给触发元素
 *  · Tab 循环锁定在弹窗内，焦点不会逃逸到背景页面
 */
import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'
import { playSound } from '../../services/sound'
import { Button } from './Button'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** 底部操作区 */
  footer?: ReactNode
  className?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  // 焦点进出：打开时移入弹窗，关闭时归还触发元素；开合伴音
  useEffect(() => {
    if (!open) return
    playSound('ui-open')
    const previous = document.activeElement as HTMLElement | null
    // createPortal 挂载后下一帧才有真实 DOM
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panelRef.current)?.focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      previous?.focus?.()
      playSound('ui-close')
    }
  }, [open])

  // 键盘行为：Escape 关闭；Tab 在弹窗内循环
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [
        ...panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        // 面板自身可聚焦（无表单控件时兜底接收焦点）
        panel,
      ]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/40 animate-[page-fade_120ms_var(--ease-standard)]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'talisman relative w-full max-w-md rounded-tile p-5 shadow-overlay animate-[page-fade_180ms_var(--ease-standard)] max-h-[85vh] overflow-y-auto focus:outline-none',
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
