/**
 * 桌宠状态 store —— 内存态 + 落库节流
 *
 * 纪律：写库只经本 store 的方法 → pet-repo，**禁止组件直接碰 Dexie**。
 * 位置会高频变化（漫游/拖拽），所以落库必须节流，否则同步快照会被刷爆。
 */
import { create } from 'zustand'
import { notifyDataChanged } from '../sync/auto'
import { readPetState, writePetState } from '../repositories/pet-repo'
import { nowISO } from '../utils/id'

/** 位置落库的最小间隔：拖拽/漫游每秒都在动，3s 一次足够跨设备恢复 */
const POSITION_WRITE_MS = 3000

export interface PetStoreState {
  /** 是否已从库里载入过（避免重复初始化覆盖内存态） */
  loaded: boolean
  position: { x: number; y: number }
  affinity: number
  lastAction: string | null

  load: () => Promise<void>
  /** 更新位置（内存即时，落库节流） */
  setPosition: (x: number, y: number) => void
  /** 好感度：加分低频，即时落库（必要时先确保已载入） */
  setAffinity: (v: number) => Promise<void>
  /** 仅跨会话保持的状态才调（busy / 休眠 / 隐藏），普通动画切换不要调 */
  setLastAction: (a: string | null) => Promise<void>
}

let lastPositionWriteAt = 0
let pendingPosition: { x: number; y: number } | null = null
let flushTimer: ReturnType<typeof setTimeout> | undefined

export const usePetStore = create<PetStoreState>((set, get) => ({
  loaded: false,
  position: { x: 0, y: 0 },
  affinity: 0,
  lastAction: null,

  load: async () => {
    if (get().loaded) return
    const row = await readPetState()
    if (row) {
      set({ position: row.position, affinity: row.affinity, lastAction: row.lastAction ?? null, loaded: true })
    } else {
      set({ loaded: true })
    }
  },

  setPosition: (x, y) => {
    const s = get()
    set({ position: { x, y } })
    // 与修行状态同一条纪律：**未载入完成前不落库**。
    // 否则会用内存里的空态（{0,0}）覆盖已存位置 —— 宠物换设备/重载就"跑回原点"。
    // 内存态照常更新，界面不卡顿；载入完成后下一次移动自然会补写。
    if (!s.loaded) return
    pendingPosition = { x, y }
    const now = Date.now()
    const elapsed = now - lastPositionWriteAt
    if (elapsed >= POSITION_WRITE_MS) {
      void commitPosition(pendingPosition)
      pendingPosition = null
      lastPositionWriteAt = now
      return
    }
    // 未到间隔：排一个尾写，保证最后一次位置一定落库（否则停在半路就丢了）
    clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      if (pendingPosition) {
        void commitPosition(pendingPosition)
        pendingPosition = null
        lastPositionWriteAt = Date.now()
      }
    }, POSITION_WRITE_MS - elapsed)
  },

  setAffinity: async (v) => {
    const s = get()
    if (!s.loaded) await s.load()
    set({ affinity: v })
    void writePetState({ affinity: v, updatedAt: nowISO() }).then(() => notifyDataChanged())
  },

  setLastAction: async (a) => {
    const s = get()
    if (!s.loaded) await s.load()
    set({ lastAction: a })
    void writePetState({ lastAction: a, updatedAt: nowISO() }).then(() => notifyDataChanged())
  },
}))

async function commitPosition(pos: { x: number; y: number }): Promise<void> {
  await writePetState({ position: pos, updatedAt: nowISO() })
  notifyDataChanged()
}
