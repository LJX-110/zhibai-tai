/**
 * 天机面板的全局开关（侧栏 / 底栏 / AI 页共用同一个面板实例）
 * 单独成文件：组件文件只导出组件，利于 Fast Refresh。
 */
import { create } from 'zustand'

interface AIChatState {
  open: boolean
  setOpen: (v: boolean) => void
}

export const useAIChatStore = create<AIChatState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
