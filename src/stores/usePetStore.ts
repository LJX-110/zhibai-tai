/**
 * 桌宠状态 store —— 内存态 + 落库节流
 *
 * 纪律：写库只经本 store 的方法 → pet-repo，**禁止组件直接碰 Dexie**。
 * 位置会高频变化（漫游/拖拽），所以落库必须节流，否则同步快照会被刷爆。
 */
import { create } from 'zustand'
import { notifyDataChanged } from '../sync/auto'
import { readPetState, writePetState } from '../repositories/pet-repo'
import { nowISO, toISODate } from '../utils/id'
import {
  affinityGain,
  daysTogether,
  milestoneDaysReached,
  milestoneGain,
  type AffinityEvent,
} from '../services/pet/affinity'

/** 位置落库的最小间隔：拖拽/漫游每秒都在动，3s 一次足够跨设备恢复 */
const POSITION_WRITE_MS = 3000

export interface PetStoreState {
  /** 是否已从库里载入过（避免重复初始化覆盖内存态） */
  loaded: boolean
  position: { x: number; y: number }
  affinity: number
  /** 初次落库时间 —— 好感度里程碑按"相识天数"算，所以必须读得到它 */
  createdAt: string
  /** 好感度账本（见 types/entities.ts 的 PetState 注释） */
  affinityDay: string
  affinityUsed: Record<string, number>
  milestones: number[]
  lastAction: string | null

  load: () => Promise<void>
  /** 更新位置（内存即时，落库节流） */
  setPosition: (x: number, y: number) => void
  /** **好感度加分**（事件 → 查规则 → 落库）。返回本次实得（0 = 已到当日上限） */
  grantAffinity: (event: AffinityEvent) => Promise<number>
  /** 好感度：直接写值（数据修复/迁移用；日常加分走 `grantAffinity`） */
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
  createdAt: '',
  affinityDay: '',
  affinityUsed: {},
  milestones: [],
  lastAction: null,

  load: async () => {
    if (get().loaded) return
    const row = await readPetState()
    if (row) {
      set({
        position: row.position,
        affinity: row.affinity,
        createdAt: row.createdAt ?? '',
        affinityDay: row.affinityDay ?? '',
        affinityUsed: row.affinityUsed ?? {},
        milestones: row.milestones ?? [],
        lastAction: row.lastAction ?? null,
        loaded: true,
      })
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

  grantAffinity: async (event) => {
    const s = get()
    if (!s.loaded) await s.load()
    const cur = get()

    const today = toISODate(new Date())
    // 跨天：当日额度清零（里程碑是"只发一次"的，不受跨天影响）
    const used = cur.affinityDay === today ? { ...cur.affinityUsed } : {}
    const gain = affinityGain(event, used[event] ?? 0)

    // 里程碑：按"相识天数"补发；`milestones` 记已发过的，换设备不重发
    const days = daysTogether(cur.createdAt ?? '', new Date())
    const extra = milestoneGain(days, cur.milestones)
    const milestones = extra > 0 ? [...new Set([...(cur.milestones ?? []), ...milestoneDaysReached(days)])] : cur.milestones

    const total = gain + extra
    if (total === 0) return 0

    used[event] = (used[event] ?? 0) + 1
    const affinity = cur.affinity + total
    set({ affinity, affinityDay: today, affinityUsed: used, milestones })
    void writePetState({
      affinity,
      affinityDay: today,
      affinityUsed: used,
      milestones,
      updatedAt: nowISO(),
    }).then(() => notifyDataChanged())
    return total
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
