/**
 * AmbientSound —— 环境音开关（跟随 settings.ambientEnabled）
 * 极轻低通噪声底（纸/风/静室感），默认关闭
 */
import { useEffect } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { setAmbient } from '../../services/sound'

export function AmbientSound() {
  const ambientEnabled = useSettingsStore((s) => s.ambientEnabled)

  useEffect(() => {
    setAmbient(ambientEnabled)
    return () => setAmbient(false)
  }, [ambientEnabled])

  return null
}
