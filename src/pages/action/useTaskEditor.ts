/**
 * 行 · 任务编辑器的开关状态（待办 / 日历两个页签共用同一形制）
 */
import { useState } from 'react'
import type { Task } from '../../types/entities'

export function useTaskEditor() {
  const [editing, setEditing] = useState<Task | null>(null)
  const [open, setOpen] = useState(false)
  return {
    editing,
    open,
    openNew: () => {
      setEditing(null)
      setOpen(true)
    },
    openEdit: (t: Task) => {
      setEditing(t)
      setOpen(true)
    },
    close: () => {
      setOpen(false)
      setEditing(null)
    },
  }
}
