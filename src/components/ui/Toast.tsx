/**
 * Toast —— 轻提示
 * 桌面：右上角；移动：底部导航上方（safe-area 感知）
 */
import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { recordNotice } from '../../services/notification'
import { playSound } from '../../services/sound'

type ToastTone = 'info' | 'success' | 'danger'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  /** 带跳转目标时，点一下直达对应板块（与系统通知的深链共用同一套 hash） */
  hash?: string
}

interface ToastStore {
  toasts: ToastItem[]
  push: (message: string, tone: ToastTone, hash?: string) => void
  dismiss: (id: number) => void
}

let seq = 0
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, tone, hash) => {
    // 顺手记一笔历史：toast 一闪而过，错过的提醒要能回看
    recordNotice(message, hash)
    // 危险提示伴一声 error —— 全站报错声音的唯一通路（见 services/sound.ts 的反馈逻辑）：
    // 只要弹了红色提示就一定有声，而不用指望每个调用点都记得加。
    // 成功/信息类不在这里出声：它们的专属音由动作本身在调用点发出，这里再响就是两声。
    if (tone === 'danger') playSound('error')
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, hash }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 2600)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  const push = useToastStore((s) => s.push)
  return {
    toast: (message: string, tone: ToastTone = 'info', hash?: string) =>
      push(message, tone, hash),
  }
}

const toneIcon: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  danger: X,
}

const toneColor: Record<ToastTone, string> = {
  info: 'text-bronze',
  success: 'text-teal',
  danger: 'text-cinnabar',
}

/** Toast 视口（挂载一次） */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return createPortal(
    <div
      className="pointer-events-none fixed z-[var(--z-toast)] flex flex-col items-center gap-2 sm:left-auto sm:right-4 sm:items-end"
      role="region"
      aria-label="轻提示"
      aria-live="polite"
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
            onClick={() => {
              // 带跳转目标的提醒（如课程提醒）点一下直达对应板块；
              // 受限 WebView 里写 hash 可能抛错，失败就只关掉提示
              if (t.hash) {
                try {
                  location.hash = t.hash
                } catch {
                  /* 忽略：不影响关闭提示 */
                }
              }
              dismiss(t.id)
            }}
            className={cn(
              'pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-control border border-line-strong bg-ink px-3.5 py-2 text-sm text-on-dark shadow-overlay anim-toast',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rotate-45', t.tone === 'danger' ? 'bg-cinnabar' : t.tone === 'success' ? 'bg-teal' : 'bg-bronze')} />
            <Icon size={15} className={toneColor[t.tone]} />
            <span className="break-all line-clamp-3">{t.message}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
