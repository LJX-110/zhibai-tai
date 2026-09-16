/**
 * InstallPrompt —— PWA 安装引导（iOS 指引 / Android·桌面一键安装）
 *
 * iOS Safari 无法程序化触发安装，只给一条「添加到主屏幕」指引；
 * Android/桌面端 Chromium 捕捉 beforeinstallprompt，提供「立即安装」按钮。
 * 已以 standalone 运行、或本会话点过关闭后不再打扰 —— 商业级体验：给出口，不纠缠。
 */
import { useEffect, useState } from 'react'
import { MonitorDown, X } from 'lucide-react'
import { Button } from '../ui/Button'

/** Chrome 系未标准化的事件类型（lib DOM 尚未收录） */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'zbt:install-dismissed'

function isStandalone(): boolean {
  // jsdom 等无 matchMedia 环境直接判否，避免渲染即崩溃
  if (typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true
  // iPadOS 13+ 伪装成 macOS 桌面 UA，靠触点数识别
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

type Kind = 'ios' | 'install'

export function InstallPrompt() {
  // 非 standalone 的 iOS 首屏即时判定为指引态；install 态只能由 beforeinstallprompt
  // 事件触发（effect 里事件回调的 setState 合规，同步 setState 会触发级联重渲染）
  const [kind, setKind] = useState<Kind | null>(() => {
    if (isStandalone()) return null
    return isIOS() ? 'ios' : null
  })
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1',
  )

  useEffect(() => {
    if (isStandalone()) return
    const onBefore = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setKind('install')
    }
    const onInstalled = () => {
      setKind(null)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (dismissed || !kind) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* 存储受限时不记录，仅本次会话关闭 */
    }
    setDismissed(true)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') dismiss()
    else setDeferred(null)
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px)+8px)] z-[var(--z-nav)] mx-auto max-w-md md:bottom-4">
      <div className="anim-enter flex items-center gap-3 rounded-paper border border-line bg-paper/95 px-3.5 py-3 shadow-float backdrop-blur">
        <MonitorDown size={18} className="shrink-0 text-skill-indigo" />
        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-soft">
          {kind === 'ios'
            ? '从浏览器菜单点「添加到主屏幕」，即可像 App 一样常驻使用'
            : '把知白台装到桌面，随时打开、离线可用'}
        </p>
        {kind === 'install' ? (
          <Button size="sm" variant="primary" onClick={() => void install()}>
            立即安装
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={dismiss}>
            知道了
          </Button>
        )}
        <button
          onClick={dismiss}
          aria-label="关闭安装提示"
          className="shrink-0 rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}