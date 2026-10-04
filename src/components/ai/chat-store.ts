/**
 * 天机面板的全局开关（侧栏 / 底栏 / AI 页共用同一个面板实例）
 * 单独成文件：组件文件只导出组件，利于 Fast Refresh。
 */
import { create } from 'zustand'

interface AIChatState {
  open: boolean
  /**
   * 待填入输入框的草稿（来自页面上的入口，如选课页「AI 建议」）。
   * 面板打开后由 `AiChatPanel` 消费一次并清空 —— **刻意不自动发送**：
   * 发送权始终在用户手里，预填的问题可以改、可以删。
   */
  draft: string | null
  setOpen: (v: boolean) => void
  /** 打开面板并预填一句提问（不发送） */
  openWithDraft: (draft: string) => void
  /** 取走草稿（取后即清，避免下次打开又冒出来） */
  consumeDraft: () => string | null
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  open: false,
  draft: null,
  setOpen: (open) => set({ open }),
  openWithDraft: (draft) => set({ open: true, draft }),
  consumeDraft: () => {
    const d = get().draft
    if (d !== null) set({ draft: null })
    return d
  },
}))