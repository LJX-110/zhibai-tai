/**
 * InstallPrompt —— PWA 安装引导条（iOS 分步指引 / Android·桌面一键安装）
 *
 * iOS Safari 无法程序化触发安装，因此只给一条指引 —— 但必须点明入口在
 * **Safari 底部中间的「分享」图标**里，否则用户根本找不到（此前文案只写
 * "从浏览器菜单点"，等于没说）。Android / 桌面端 Chromium 的安装时机由
 * `install.ts` 统一捕获，这里提供「立即安装」。
 *
 * 已以独立窗口运行、或本会话点过关闭后不再打扰 —— 给出口，不纠缠。
 */
import { useState, useSyncExternalStore } from 'react'
import { MonitorDown, X } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  hasInstallPrompt,
  isIOS,
  isStandalone,
  noInstallPrompt,
  promptInstall,
  subscribeInstall,
} from './install'

const DISMISS_KEY = 'zbt:install-dismissed'

type Kind = 'ios' | 'install'

export function InstallPrompt() {
  const canInstall = useSyncExternalStore(subscribeInstall, hasInstallPrompt, noInstallPrompt)
  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1',
  )
  // 只在首次渲染判定一次：iOS 且未安装 → 给分步指引
  const [iosGuide] = useState(() => !isStandalone() && isIOS())

  if (dismissed) return null
  const kind: Kind | null = canInstall ? 'install' : iosGuide ? 'ios' : null
  if (!kind) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* 存储受限时不记录，仅本次会话关闭 */
    }
    setDismissed(true)
  }

  const install = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') dismiss()
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px)+8px)] z-[var(--z-nav)] mx-auto max-w-md md:bottom-4">
      <div className="anim-enter flex items-center gap-3 rounded-paper border border-line bg-paper/95 px-3.5 py-3 shadow-float backdrop-blur">
        <MonitorDown size={18} className="shrink-0 text-skill-indigo" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-soft">
          {kind === 'ios'
            ? '点 Safari 底部中间的「分享」，选「添加到主屏幕」，就能像 App 一样用'
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
