/**
 * 待办操作 hook —— 勾选/编辑/删除 + 道行接口预留
 */
import type { Task } from '../types/entities'
import { useTaskStore } from '../stores/useTaskStore'
import { recordActivity } from '../services/activity'
import { useToast } from '../components/ui/Toast'

export function useTaskActions() {
  const toast = useToast().toast

  const toggle = async (task: Task) => {
    const now = new Date().toISOString()
    await useTaskStore.getState().update(task.id, {
      done: !task.done,
      completedAt: !task.done ? now : task.completedAt,
      updatedAt: now,
    })
    // 预留：任务完成产生道行（首页道行已按今日完成数计算）
    if (!task.done) {
      void recordActivity({ entityType: 'task', entityId: task.id, title: `完成待办：${task.title.slice(0, 30)}` })
      toast('完成待办 · 道行有进', 'success')
    }
  }

  const save = async (task: Task) => {
    await useTaskStore.getState().save(task)
    toast('待办已保存', 'success')
  }

  const remove = async (task: Task) => {
    await useTaskStore.getState().remove(task.id)
    toast('待办已删除')
  }

  return { toggle, save, remove }
}
