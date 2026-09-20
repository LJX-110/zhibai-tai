/**
 * Inspector 的开关 store 与类型
 * 单独成文件：详情视图需要 `open()` 做相互跳转（任务 ↔ 情报 ↔ 项目），
 * 放进组件文件会形成循环依赖。
 */
import { create } from 'zustand'

export type InspectorType =
  | 'task'
  | 'collection'
  | 'project'
  | 'intelligence'
  | 'course'
  | 'finance'
  | 'ai'
  | 'divination'

interface InspectorState {
  type: InspectorType | null
  id: string | null
  open: (type: InspectorType, id: string) => void
  close: () => void
}

export const useInspectorStore = create<InspectorState>((set) => ({
  type: null,
  id: null,
  open: (type, id) => set({ type, id }),
  close: () => set({ type: null, id: null }),
}))
