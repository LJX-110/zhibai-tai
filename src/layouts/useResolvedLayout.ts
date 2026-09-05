/**
 * 布局模式解析 —— 桌面工作台 / 移动终端 / 自动
 */
import { useEffect, useState } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'

export type ResolvedLayout = 'desktop' | 'mobile'

/** 断点：768px 以下视为移动 */
const MOBILE_QUERY = '(max-width: 767px)'

export function useResolvedLayout(): ResolvedLayout {
  const mode = useSettingsStore((s) => s.layoutMode)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (mode === 'desktop') return 'desktop'
  if (mode === 'mobile') return 'mobile'
  return isMobile ? 'mobile' : 'desktop'
}
