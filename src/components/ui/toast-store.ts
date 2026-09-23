/**
 * Toast 的**状态层** —— 与渲染层（`Toast.tsx`）分家的原因：
 * 同一个文件里既导出 zustand store / hook、又导出组件，会让 React Fast Refresh
 * 失去完整性（改这个文件时组件状态被整体重置）。而全站有十几处要 `useToast`，
 * 它们只需要状态、根本不需要组件 —— 分开之后各取所需，热更新也不再退化。
 *
 * ⚠️ 导入路径：**状态从这里（`ui/toast-store`）取，组件从 `ui/Toast` 取**。
 * 想一次拿全就用 barrel（`components/ui`），它已经分别指向两处。
 */
import { create } from 'zustand'
import { recordNotice } from '../../services/notification'
import type { NoticeSourceKey } from '../../services/notify-sources'
import { playSound } from '../../services/sound'

export type ToastTone = 'info' | 'success' | 'danger'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  /** 带跳转目标时，点一下直达对应板块（与系统通知的深链共用同一套 hash） */
  hash?: string
}

interface ToastStore {
  toasts: ToastItem[]
  push: (message: string, tone: ToastTone, hash?: string, source?: NoticeSourceKey) => void
  dismiss: (id: number) => void
}

let seq = 0
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, tone, hash, source) => {
    /* 只有**提醒**进历史 —— 判据是"调用方给了 source"。
       全站一百多处 `push` 是纯操作回执（"待办已保存"），它们每次都记的话，
       50 条的历史缓冲会被回执挤满，"昨天那条错过的提醒"反而翻不到。
       提醒类的调用方（投递管线、就地报错）显式传 source，自然进历史。 */
    if (source) recordNotice(message, hash, source)
    // 危险提示伴一声 error —— 全站报错声音的唯一通路（见 services/sound.ts 的反馈逻辑）：
    // 只要弹了红色提示就一定有声，而不用指望每个调用点都记得加。
    // 成功/信息类不在这里出声：它们的专属音由动作本身在调用点发出，这里再响就是两声。
    if (tone === 'danger') playSound('error')
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, hash }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 2600)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  const push = useToastStore((s) => s.push)
  return {
    /** `source` 只给"就地报错但不在投递管线上"的少数调用点用（如顶栏同步失败） */
    toast: (
      message: string,
      tone: ToastTone = 'info',
      hash?: string,
      source?: NoticeSourceKey,
    ) => push(message, tone, hash, source),
  }
}
