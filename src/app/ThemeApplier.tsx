/**
 * 主题应用 —— 根据设置把 data-theme 写到 <html>（Light / Dark / System）
 */
import { useEffect } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'
import type { ThemeMode } from '../stores/useSettingsStore'

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
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
