/**
 * PomodoroTicker —— 全局番茄钟秒针（挂在 App 顶层）
 * 由全局 store 驱动，学页 / Focus / 顶栏共用同一计时
 */
import { useEffect } from 'react'
import { usePomodoroTimerStore } from '../../stores/usePomodoroTimerStore'

export function PomodoroTicker() {
  const running = usePomodoroTimerStore((s) => s.running)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => usePomodoroTimerStore.getState().tick(), 1000)
    return () => window.clearInterval(id)
  }, [running])

  return null
}
