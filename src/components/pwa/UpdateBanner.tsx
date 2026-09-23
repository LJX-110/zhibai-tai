/**
 * PWA 更新横幅 —— SW 发现新版本（`registerType: 'prompt'`）时提示用户点击刷新。
 *
 * 为什么不用 autoUpdate：后台悄悄换版本，用户长期停在旧版而不自知 ——
 * 排查线上问题时，"用户跑的到底是哪一版"会变成一个无法回答的问题。
 *
 * 从 `main.tsx` 拆出来的原因：入口文件里有组件 + 导出的非组件会让 Fast Refresh
 * 失去完整性；而且入口本不该承担任何 UI。
 */
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  useEffect(() => {
    registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => setNeedRefresh(false),
    })
  }, [])
  if (!needRefresh) return null
  return (
    <div className="anim-enter fixed bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px)+14px)] left-1/2 z-[var(--z-toast)] flex -translate-x-1/2 items-center gap-3 rounded-tile border border-line-strong bg-ink px-4 py-2.5 text-sm text-on-dark shadow-overlay sm:bottom-5">
      <span>发现新版本</span>
      <button
        onClick={() => window.location.reload()}
        className="link-underline text-sm text-gold"
      >
        立即刷新
      </button>
    </div>
  )
}
