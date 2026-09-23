/**
 * 主题应用 —— 根据设置把 data-theme 写到 <html>（Light / Dark / System）
 *
 * ⚠️ 状态栏配色（`<meta name="theme-color">`）必须与 data-theme **同进同出**：
 * 侧栏浅色是黛蓝、深色是绛红，而 meta 只接受一个值 —— 不同步就表现为
 * 深色主题下顶部多出一条黛蓝色带（"顶部没铺满"）。取值见 `./theme`。
 */
import { useEffect } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { ThemeMode } from '../stores/useSettingsStore'
import { applyThemeColor } from './theme'

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
  applyThemeColor(theme)
}

export function ThemeApplier() {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    applyTheme(resolveTheme(theme))
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return null
}
