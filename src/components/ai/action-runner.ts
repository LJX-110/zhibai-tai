/**
 * 天机动作的落库执行 —— 一律走 store 工厂，绝不直接碰 Dexie。
 *
 * 走 store 工厂才能自动获得：墓碑（删除可传播）/ LWW 合并 / 加密快照同步 /
 * 备份导出，并在写入后触发其它页面即时刷新（notifyDataChanged）。
 * 返回是否写入成功，供面板决定后续提示。
 */
import { createId, todayISO, nowISO } from '../../utils/id'
import { useTaskStore } from '../../stores/useTaskStore'
import { useNoteStore } from '../../stores/useNoteStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import type { TianjiActionPayload } from './action-protocol'

export async function applyTianjiAction(a: TianjiActionPayload): Promise<boolean> {
  const now = nowISO()
  if (a.action === 'create_task') {
    return useTaskStore.getState().add({
      id: createId(),
      title: a.title,
      description: '',
      done: false,
      priority: a.priority,
      dueDate: a.dueDate,
      tags: [],
      repeat: 'none',
      projectId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
  }
  if (a.action === 'create_note') {
    return useNoteStore.getState().add({
      id: createId(),
      kind: 'note',
      title: a.title,
      body: a.body,
      tags: a.tags,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    })
  }
  return useFinanceStore.getState().add({
    id: createId(),
    kind: a.kind,
    amount: a.amount,
    category: a.category,
    date: a.date ?? todayISO(),
    note: a.note || undefined,
    isPurchase: false,
    createdAt: now,
    updatedAt: now,
  })
}
