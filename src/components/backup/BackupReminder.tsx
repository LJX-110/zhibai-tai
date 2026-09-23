/**
 * 备份提醒 —— 数据容灾的最后一环
 * 每 7 天轻提示一次「去系统页导出备份」；当天只提醒一次；
 * 连续提醒满 3 次后自动停（默认已养成熟练工，不再打扰）。
 */
import { useEffect } from 'react'
import { useToastStore } from '../ui/toast-store'
import { parseISO, todayISO } from '../../utils/id'

const KEY = 'zbt:backup-remind'
const GAP_DAYS = 7
const MAX_HINTS = 3

export function BackupReminder() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    let last: { day: string; count?: number } | null = null
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) last = JSON.parse(raw) as { day: string; count?: number }
    } catch {
      /* 存档损坏视为首次 */
    }
    const today = todayISO()
    const persist = (count: number) => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ day: today, count }))
      } catch {
        /* 存储不可用则跳过 */
      }
    }
    if (!last?.day || last.day === today) {
      persist(last?.count ?? 0)
      return
    }
    const gap = Math.round((parseISO(today).getTime() - parseISO(last.day).getTime()) / 86400000)
    if (gap >= GAP_DAYS) {
      const count = (last.count ?? 0) + 1
      if (count <= MAX_HINTS) {
        useToastStore.getState().push('已有几天未备份，建议在「系统 · 数据」导出备份', 'info')
      }
      persist(count)
    } else {
      persist(last.count ?? 0)
    }
  }, [])
  return null
}