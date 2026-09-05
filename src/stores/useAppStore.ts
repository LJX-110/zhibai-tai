/**
 * 应用级 store —— 当前导航 + 布局模式
 */
import { create } from 'zustand'
import type { SectionId } from '../app/navigation'

export type LayoutMode = 'auto' | 'desktop' | 'mobile'

interface AppState {
  /** 当前一级导航 */
  section: SectionId
  setSection: (s: SectionId) => void
  /** v0.4 桌面专注模式（隐藏侧栏/顶栏，只留任务+番茄钟+时间） */
  focusMode: boolean
  setFocusMode: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  section: 'overview',
  setSection: (section) => set({ section }),
  focusMode: false,
  setFocusMode: (focusMode) => set({ focusMode }),
}))
