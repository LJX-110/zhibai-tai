/**
 * PWA 更新横幅 —— SW 发现新版本（`registerType: 'prompt'`）时提示用户点击刷新。
 *
 * 为什么不用 autoUpdate：后台悄悄换版本，用户长期停在旧版而不自知 ——
 * 排查线上问题时，"用户跑的到底是哪一版"会变成一个无法回答的问题。
 *
 * ⚠️ 2026-10-07 修：此前点「立即刷新」只调 `window.location.reload()` ——
 * prompt 模式下新 SW 会一直停在 `waiting`，仅重载页面**不会让它接管**，
 * 用户于是"刷新好多次还是旧版"。现在统一走 `refresh.ts`（发 SKIP_WAITING →
 * 等 controllerchange → 刷新），与系统页页头「刷新」按钮同一个出口。
 *
 * 从 `main.tsx` 拆出来的原因：入口文件里有组件 + 导出的非组件会让 Fast Refresh
 * 失去完整性；而且入口本不该承担任何 UI。
 */
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { bindUpdateSW, refreshToLatest } from './refresh'

export function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  /** 点「立即刷新」后的忙碌态：激活新 SW 需要一瞬间，别让按钮看起来没点上 */
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => setNeedRefresh(false),
    })
    // 登记官方出口给系统页「刷新」按钮共用（见 refresh.ts：只此一处注册 SW）
    bindUpdateSW(updateSW)
  }, [])
  if (!needRefresh) return null
  return (
    <div className="anim-enter fixed bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px)+14px)] left-1/2 z-[var(--z-toast)] flex -translate-x-1/2 items-center gap-3 rounded-tile border border-line-strong bg-ink px-4 py-2.5 text-sm text-on-dark shadow-overlay sm:bottom-5">
      <span>发现新版本</span>
      <button
        onClick={() => {
          setBusy(true)
          void refreshToLatest()
        }}
        disabled={busy}
        className="link-underline text-sm text-gold"
      >
        {busy ? '刷新中…' : '立即刷新'}
      </button>
    </div>
  )
}
