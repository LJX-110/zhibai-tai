/**
 * 修行状态 store —— 累计功行的落库与结算
 *
 * 纪律：写库只经本 store → cultivation-repo，禁止组件直接碰 Dexie。
 * 「境界只升不降」由结算纯函数保证（见 services/cultivation.ts：差额为负时记 0、不回收）。
 * 历史最高另存本机的那套已随「历史最高境界」功能一并删除，勿再补回。
 */
import { create } from 'zustand'
import { notifyDataChanged } from '../sync/auto'
import {
  readCultivationState,
  writeCultivationState,
} from '../repositories/cultivation-repo'
import {
  emptyCultivationState,
  seclusionReward,
  settleDaily,
} from '../services/cultivation'
import { nowISO, todayISO } from '../utils/id'

export interface CultivationStoreState {
  loaded: boolean
  total: number
  bonus: number
  todayDate: string
  todayCounted: number
  seclusionCount: number

  load: () => Promise<void>
  /**
   * 今日结算：把「今日功行」的增量并进累计功行（同一天只补差额）。
   * 返回本次新增的功行，供界面提示「今日＋N」。
   */
  settleMerit: (todayMerit: number) => Promise<number>
  /** 闭关结算：认领实事的专注完成时调用，返回本次获得的功行 */
  grantSeclusion: (minutes: number) => Promise<number>
}

export const useCultivationStore = create<CultivationStoreState>((set, get) => ({
  loaded: false,
  ...emptyCultivationState(),

  load: async () => {
    if (get().loaded) return
    const row = await readCultivationState()
    if (row) {
      set({
        total: row.total,
        bonus: row.bonus,
        todayDate: row.todayDate,
        todayCounted: row.todayCounted,
        seclusionCount: row.seclusionCount,
        loaded: true,
      })
    } else {
      set({ loaded: true })
    }
  },

  settleMerit: async (todayMerit) => {
    const s = get()
    // 未载入就结算会用空态覆盖已存功行（total 从 0 起算再写回 = 抹掉历史），
    // 所以宁可这次不结、等载入完成后再由 hook 触发
    if (!s.loaded) return 0
    const today = todayISO()
    const next = settleDaily(s, todayMerit, today)
    if (next.gained === 0 && next.todayDate === s.todayDate) return 0

    // 境界不必另外记账：`realmOf` 是累计功行的纯函数，而结算只升不降 ——
    // 「最高境界」那套字段（bestRank/bestTitle/bestAt）已随功能删除，勿再补回
    set({
      total: next.total,
      todayDate: next.todayDate,
      todayCounted: next.todayCounted,
    })
    await writeCultivationState({
      total: next.total,
      todayDate: next.todayDate,
      todayCounted: next.todayCounted,
      updatedAt: nowISO(),
    })
    notifyDataChanged()
    return next.gained
  },

  grantSeclusion: async (minutes) => {
    /* ⚠️ 顺序不能反：**先 await 载入，再取快照**。
       `get()` 返回的是调用那一刻的状态副本，若在 await 之前取，`load()` 完成后
       手里那份副本仍是旧值（未载入时 bonus=0、seclusionCount=0），
       于是结算会以**空基数**写库 —— 把历史累计的闭关功行静默抹掉。
       与 `settleMerit` 的 `loaded` 守卫是同一类纪律，别只守一处。 */
    await get().load()
    const s = get()
    const gain = seclusionReward(minutes)
    if (gain <= 0) return 0
    const seclusionCount = s.seclusionCount + 1
    const bonus = s.bonus + gain
    set({ bonus, seclusionCount })
    await writeCultivationState({
      bonus,
      seclusionCount,
      updatedAt: nowISO(),
    })
    notifyDataChanged()
    return gain
  },
}))
