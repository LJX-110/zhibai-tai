/**
 * 待办操作 hook —— 勾选/编辑/删除 + 重复任务周期生成
 *
 * 完成逻辑抽为 toggleTaskCore（无 UI 依赖）：
 * 待办列表勾选与 Inspector 详情面板的完成按钮共用同一实现，
 * 避免"列表完成会生成下一次、面板完成不会"的行为分裂。
 */
import type { Task } from '../types/entities'
import { useTaskStore } from '../stores/useTaskStore'
import { recordActivity } from '../services/activity'
import { createId } from '../utils/id'
import { useToast } from '../components/ui/Toast'

/** 按重复周期推算下一次到期日（以原到期日为基准，逾期完成则顺延追赶） */
function nextDueDate(task: Task): string | null {
  if (task.repeat === 'none') return null
  const base = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : new Date()
  const d = new Date(base)
  if (task.repeat === 'daily') d.setDate(d.getDate() + 1)
  else if (task.repeat === 'weekly') d.setDate(d.getDate() + 7)
  else if (task.repeat === 'monthly') d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 勾选/完成核心：更新状态；完成 recurring 任务时生成下一条
 * （同内容、新 id、未完成）。返回本次是否完成、是否生成了下一次。
 */
export async function toggleTaskCore(
  task: Task,
): Promise<{ done: boolean; createdNext: boolean }> {
  const now = new Date().toISOString()
  await useTaskStore.getState().update(task.id, {
    done: !task.done,
    completedAt: !task.done ? now : task.completedAt,
    updatedAt: now,
  })
  const done = !task.done
  let createdNext = false
  if (done) {
    if (task.repeat !== 'none') {
      await useTaskStore.getState().add({
        ...task,
        id: createId(),
        done: false,
        completedAt: null,
        dueDate: nextDueDate(task),
        createdAt: now,
        updatedAt: now,
      })
      createdNext = true
    }
    void recordActivity({ entityType: 'task', entityId: task.id, title: `完成待办：${task.title.slice(0, 30)}` })
  }
  return { done, createdNext }
}

export function useTaskActions() {
  const toast = useToast().toast

  const toggle = async (task: Task) => {
    const { done, createdNext } = await toggleTaskCore(task)
    if (done) {
      // 重复任务：完成后自动生成下一周期
      toast(createdNext ? '完成待办 · 已生成下一次' : '完成待办 · 道行有进', 'success')
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
