/**
 * Toast —— 轻提示
 * 桌面：右上角；移动：底部导航上方（safe-area 感知）
 */
import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../utils/cn'

type ToastTone = 'info' | 'success' | 'danger'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastStore {
  toasts: ToastItem[]
  push: (message: string, tone: ToastTone) => void
  dismiss: (id: number) => void
}

let seq = 0
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, tone) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 2600)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  const push = useToastStore((s) => s.push)
  return { toast: (message: string, tone: ToastTone = 'info') => push(message, tone) }
}

const toneIcon: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  danger: X,
}

const toneColor: Record<ToastTone, string> = {
  info: 'text-bronze',
  success: 'text-cinnabar',
  danger: 'text-cinnabar',
}

/** Toast 视口（挂载一次） */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] flex flex-col items-center gap-2 sm:left-auto sm:right-4 sm:items-end"
      style={{
        left: 0,
        right: 0,
        bottom:
          'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      {toasts.map((t) => {
        const Icon = toneIcon[t.tone]
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={cn(
              'pointer-events-auto flex items-center gap-2 rounded-[4px] border border-line-strong bg-ink px-3.5 py-2 text-sm text-on-dark shadow-overlay animate-[toast-in_200ms_var(--ease-standard)]',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rotate-45', t.tone === 'danger' ? 'bg-cinnabar' : 'bg-bronze')} />
            <Icon size={15} className={toneColor[t.tone]} />
            <span>{t.message}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
