/**
 * 行 · 插件 —— 待办与笔记的落库动作
 *
 * 明细区没有"待办明细"块（基础概览已经给了今日/逾期/已完成三条），
 * 所以这个插件只贡献动作：AI 提议的 create_task / create_note 由它落库。
 */
import { createId, nowISO } from '../../../utils/id'
import { useTaskStore } from '../../../stores/useTaskStore'
import { useNoteStore } from '../../../stores/useNoteStore'
import type { TianjiPlugin } from './index'

export const actionPlugin: TianjiPlugin = {
  id: 'action',
  actions: {
    create_task: async (a) => {
      const now = nowISO()
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
    },
    create_note: async (a) => {
      const now = nowISO()
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
    },
  },
}
