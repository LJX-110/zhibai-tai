/**
 * 通知中心的全局开合（Step 5-3D）
 *
 * 单独成文件：组件文件只导出组件（Fast Refresh 约定，与 `ai/chat-store` 同例）。
 * 入口有两处（移动端顶栏铃铛 / 桌面侧栏），弹层只有一个 ——
 * 于是"两处按钮控制同一个弹层"由这个 store 保证。
 */
import { create } from 'zustand'

interface NoticeCenterState {
  open: boolean
  setOpen: (v: boolean) => void
}

export const useNoticeCenterStore = create<NoticeCenterState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))