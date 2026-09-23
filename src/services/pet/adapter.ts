/**
 * 桌宠 · 宿主适配层（`PetHost`）
 *
 * 渲染层只认这个接口，**不直接碰 window / fetch / Dexie** —— 这样将来做
 * P7 的桌面透明置顶窗（Electron / Tauri）时，只需注入另一份实现，渲染层零改动。
 *
 * 本轮只实现**浏览器版**（PWA 内），桌面版留给 P7。
 */
import type { PetState } from '../../types/entities'
import { readPetState, writePetState } from '../../repositories/pet-repo'
import { petAssetUrl } from './config'
import type { Rect } from './types'

export interface PetHost {
  /** 当前视口矩形（px）。桌面壳会换成"工作区"（排除任务栏/刘海） */
  getViewport: () => Rect
  /** 动画名 → 素材 URL。桌面壳会换成 file:// 本地路径 */
  resolveAsset: (name: string) => string
  /** 持久化（节流由调用方负责，见 usePetStore） */
  persist: (patch: Partial<Omit<PetState, 'id'>>) => Promise<void>
  /** 载入初始状态；从未落库返回 null */
  load: () => Promise<PetState | null>
  /** 页面可见性变化订阅；返回取消订阅。后台时该停掉循环省电 */
  onVisibilityChanged: (fn: (visible: boolean) => void) => () => void
}

/** 浏览器实现（PWA 场景） */
export function createBrowserHost(): PetHost {
  return {
    getViewport: () => ({
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    resolveAsset: petAssetUrl,
    persist: writePetState,
    load: readPetState,
    onVisibilityChanged: (fn) => {
      const onChange = () => fn(document.visibilityState === 'visible')
      document.addEventListener('visibilitychange', onChange)
      return () => document.removeEventListener('visibilitychange', onChange)
    },
  }
}
