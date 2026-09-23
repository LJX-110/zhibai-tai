/**
 * Toast —— 轻提示（**渲染层**）
 * 桌面：右上角；移动：底部导航上方（safe-area 感知）
 *
 * 状态（store / `useToast`）已独立到 `./toast-store`：
 * 同一文件既导出 store 又导出组件会让 Fast Refresh 失去完整性，
 * 而全站十几处只需要那个 hook、并不需要这个组件。
 */
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useToastStore, type ToastTone } from './toast-store'

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
