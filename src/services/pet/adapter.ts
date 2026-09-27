/**
 * 桌宠 · 宿主适配层（`PetHost`）
 *
 * 渲染层只认这个接口，**不直接碰 window / fetch / Dexie** ——
 * 宿主差异（视口从哪来、素材 URL 怎么拼、本机位置存哪）全在这层收口，
 * 桌宠核心因此保持设备无关、可纯函数单测。
 *
 * 接口刻意分成三档（见下方注释）：**必备能力** · **本机状态** · **业务状态**。
 * `alwaysOnTop` / `clickThrough` / 窗口尺寸这类窗口管理器专属能力**刻意不加** ——
 * 本项目是纯前端 PWA（手机优先），只有当前真用得上的能力才进接口。
 *
 * 当前只实现**浏览器版**（PWA 内）。
 */
import type { PetState } from '../../types/entities'
import { readPetState, writePetState } from '../../repositories/pet-repo'
import { petAssetUrl } from './config'
import type { Rect } from './types'

export interface PetHost {
  /* ── 必备能力（任何宿主实现都必须提供）────────────────────────── */

  /**
   * 宿主矩形（px）—— 桌宠可活动的**地方**（浏览器 = 视口）。
   * 纯几何换算交给 `./geometry` 的 `boundsOf` —— 上层不需要认识"窗口"。
   */
  getViewport: () => Rect
  /** 动画名 → 素材 URL（浏览器版 = `public/pet/` 下的路径） */
  resolveAsset: (name: string) => string
  /** 页面可见性变化订阅；返回取消订阅。后台时该停掉循环省电 */
  onVisibilityChanged: (fn: (visible: boolean) => void) => () => void

  /* ── 本机状态（**设备级，不进同步快照**）──────────────────────
     位置是"这台设备上它待在哪"，不是业务数据。
     此前它写在业务表 `petState.position` 并触发 `notifyDataChanged()` ——
     于是漫游每几秒就把同步链路上的脏标记刷新一遍（默认 30s 间隔下会让
     定时器被反复重置，同步反而永远不跑）。现在改由宿主自己保管：
     浏览器版用 localStorage，不碰业务表。 */

  /** 读本机存档的位置；没有 / 损坏则 null（调用方落回锚点） */
  loadLocalPosition: () => { x: number; y: number } | null
  /** 写本机存档的位置（低频：拖拽结束、落位、resize 校正时） */
  persistLocalPosition: (pos: { x: number; y: number }) => void

  /* ── 业务状态（随加密快照跨设备同步）───────────────────────── */

  /** 持久化业务字段（好感度 / 里程碑 / lastAction…）。节流由调用方负责 */
  persist: (patch: Partial<Omit<PetState, 'id'>>) => Promise<void>
  /** 载入业务状态；从未落库返回 null */
  load: () => Promise<PetState | null>
}

/** 本机位置存档键（与桌宠其它本机数据同前缀，见 `usePetSaying` 的 last-seen） */
const LOCAL_POSITION_KEY = 'zbt:pet-position:v1'

/** 浏览器实现（PWA 场景）：宿主矩形 = 视口，本机状态 = localStorage */
export function createBrowserHost(): PetHost {
  return {
    getViewport: () => ({
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    resolveAsset: petAssetUrl,
    onVisibilityChanged: (fn) => {
      const onChange = () => fn(document.visibilityState === 'visible')
      document.addEventListener('visibilitychange', onChange)
      return () => document.removeEventListener('visibilitychange', onChange)
    },
    loadLocalPosition: () => {
      try {
        const raw = localStorage.getItem(LOCAL_POSITION_KEY)
        if (!raw) return null
        const p = JSON.parse(raw) as { x?: unknown; y?: unknown }
        if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
        return { x: p.x, y: p.y }
      } catch {
        // 存档损坏 / 隐私模式读不到：当作没有，落回配置角落（不影响使用）
        return null
      }
    },
    persistLocalPosition: (pos) => {
      try {
        localStorage.setItem(LOCAL_POSITION_KEY, JSON.stringify(pos))
      } catch {
        // 写不进去只影响"下次从原位开始"，不该影响桌宠本身
      }
    },
    persist: writePetState,
    load: readPetState,
  }
}
