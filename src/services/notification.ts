/**
 * 轻量通知 —— 到期待办 / 关注更新 / 情报更新（非强制弹窗）
 * 应用内 toast + 可选浏览器 Notification
 */
import type { Task } from '../types/entities'

export interface Notice {
  id: string
  title: string
  body: string
  tone?: 'cinnabar' | 'bronze' | 'teal'
}

/** 计算到期/逾期待办通知（纯函数） */
export function dueTaskNotices(tasks: Task[], today: string): Notice[] {
  const due = tasks.filter((t) => !t.done && t.dueDate === today)
  const overdue = tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today)
  const out: Notice[] = []
  if (overdue.length > 0) {
    out.push({
      id: 'due-overdue',
      title: `${overdue.length} 项待办已逾期`,
      body: overdue.slice(0, 3).map((t) => t.title).join(' · '),
      tone: 'cinnabar',
    })
  }
  if (due.length > 0) {
    out.push({
      id: 'due-today',
      title: `${due.length} 项待办今日到期`,
      body: due.slice(0, 3).map((t) => t.title).join(' · '),
      tone: 'bronze',
    })
  }
  return out
}

/** 关注更新计数（纯函数） */
export function followUpdateCount(
  follows: { keyword: string }[],
  items: { title: string; tags: string[]; category?: string; source?: string; read: boolean }[],
): number {
  const unread = items.filter((it) => !it.read)
  if (follows.length === 0 || unread.length === 0) return 0
  return follows.filter((f) =>
    unread.some(
      (it) =>
        it.title.toLowerCase().includes(f.keyword.toLowerCase()) ||
        (it.tags ?? []).some((t) => t.toLowerCase().includes(f.keyword.toLowerCase())) ||
        (it.category ?? '').toLowerCase().includes(f.keyword.toLowerCase()) ||
        (it.source ?? '').toLowerCase().includes(f.keyword.toLowerCase()),
    ),
  ).length
}

/** 浏览器 Notification（需用户授权） */
export async function browserNotify(title: string, body: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'denied') return false
  if (Notification.permission === 'default') {
    try {
      const p = await Notification.requestPermission()
      if (p !== 'granted') return false
    } catch {
      return false
    }
  }
  try {
    const n = new Notification(title, { body, tag: title, silent: true })
    window.setTimeout(() => n.close(), 8000)
    return true
  } catch {
    return false
  }
}
