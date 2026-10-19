/**
 * 渲染体里的"现在" —— 唯一入口。
 *
 * 约定（AGENTS 硬性约定 10）：`Date.now()` / `new Date()` 不直接写进组件渲染体。
 * 需要"现在"的组件订阅这里：挂载时取一次，之后按 intervalMs 自动刷新 ——
 * 页面一直开着也会跨过午夜 / 跨过整点，而不是停在首次渲染的那一刻。
 *
 * 默认 60s：日期（今天/本周/本月）与顶栏 HH:mm 都是分钟级精度，一分钟一次足够；
 * 秒级场景（FocusMode 的时钟）显式传 1000。
 */
import { useEffect, useState } from 'react'

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
