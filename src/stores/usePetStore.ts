/**
 * 桌宠**业务状态** store（好感度 / 里程碑 / lastAction）
 *
 * 纪律：写库只经本 store 的方法 → pet-repo，**禁止组件直接碰 Dexie**。
 *
 * ⚠️ **这里不再有 position**（2026-09-27 桌宠第一阶段）。
 * 位置曾是本 store 的高频字段（节流 3s 落库、且写在业务表里），于是每次落库都
 * `notifyDataChanged()` → 漫游会不断刷新同步脏标记与定时器；而默认 30s 间隔下
 * `schedule()` 是"clearTimeout 后重设"，被持续刷新就等于 **同步永远不会发生**。
 * 位置现在交给宿主保管（`PetHost.loadLocalPosition / persistLocalPosition`，
 * 设备级、不进快照），本 store 只管真正需要跨设备的业务数据。
 *
 * 旧字段 `petState.position` **保留在表里不删**（老用户数据兼容）：`usePetLoop`
 * 首次落位时会读它一次做迁移，之后不再写入。
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

export interface PetStoreState {
  /** 是否已从库里载入过（避免重复初始化覆盖内存态） */
  loaded: boolean
  affinity: number
  /** 初次落库时间 —— 好感度里程碑按"相识天数"算，所以必须读得到它 */
  createdAt: string
  /** 好感度账本（见 types/entities.ts 的 PetState 注释） */
  affinityDay: string
  affinityUsed: Record<string, number>
  milestones: number[]
  lastAction: string | null

  load: () => Promise<void>
  /** **好感度加分**（事件 → 查规则 → 落库）。返回本次实得（0 = 已到当日上限） */
  grantAffinity: (event: AffinityEvent) => Promise<number>
  /** 好感度：直接写值（数据修复/迁移用；日常加分走 `grantAffinity`） */
  setAffinity: (v: number) => Promise<void>
  /** 仅跨会话保持的状态才调（busy / 休眠 / 隐藏），普通动画切换不要调 */
  setLastAction: (a: string | null) => Promise<void>
}

export const usePetStore = create<PetStoreState>((set, get) => ({
  loaded: false,
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
        // ⚠️ 刻意不读 row.position：那是 legacy 字段，位置归宿主管（见文件头）。
        // 读进来只会让人以为它还是"当前位置"，从而又走上"写它 → 触发同步"的老路。
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
