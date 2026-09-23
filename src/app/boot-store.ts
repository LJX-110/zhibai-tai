/**
 * 启动就绪状态 —— 与 `Bootstrap` 组件分家的原因：
 * 同一文件既导出 zustand store 又导出组件会让 React Fast Refresh 失去完整性。
 * 消费方（`App` / `BootScreen`）只需要这个 store，不需要那个组件。
 *
 * 语义：App 据此决定显示启动屏还是工作台；`step` 是启动屏上那行阶段文案。
 * 进度条宽度由 CSS 时间动画推进，所以这里**不维护步骤计数** ——
 * 算了没人看，反而多一份需要同步的状态。
 */
import { create } from 'zustand'

interface BootState {
  ready: boolean
  step: string
  setStep: (label: string) => void
  markReady: () => void
}

export const useBootStore = create<BootState>((set) => ({
  ready: false,
  step: '正在铺开文房',
  setStep: (label) => set({ step: label }),
  markReady: () => set({ ready: true }),
}))
