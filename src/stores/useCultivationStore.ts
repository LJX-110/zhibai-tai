/**
 * 修行状态 store —— 累计修为的落库与结算
 *
 * 纪律：写库只经本 store → cultivation-repo，禁止组件直接碰 Dexie。
 * 「境界只升不降」由两层共同保证：结算是纯函数（见 services/cultivation.ts，
 * 差额为负时记 0 不回收），落库时也对 bestRank 取 max。
 */
import { create } from 'zustand'
import { notifyDataChanged } from '../sync/auto'
import {
  readCultivationState,
  writeCultivationState,
} from '../repositories/cultivation-repo'
import {
  emptyCultivationState,
  realmOf,
  seclusionReward,
  settleDaily,
  totalCultivation,
} from '../services/cultivation'
import { nowISO, todayISO } from '../utils/id'

export interface CultivationStoreState {
  loaded: boolean
  total: number
  bonus: number
  todayDate: string
  todayCounted: number
  seclusionCount: number
  bestRank: number
  bestTitle: string
  bestAt: string | null

  load: () => Promise<void>
  /**
   * 今日结算：把「今日总分」的增量并进累计修为（同一天只补差额，见纯函数说明）。
   * 返回本次新增的修为，供界面提示「今日＋N」。
   */
  settleToday: (todayTotal: number) => Promise<number>
  /** 闭关结算：认领实事的专注完成时调用，返回本次获得的修为 */
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
        bestRank: row.bestRank,
        bestTitle: row.bestTitle,
        bestAt: row.bestAt ?? null,
        loaded: true,
      })
    } else {
      set({ loaded: true })
    }
  },

  settleToday: async (todayTotal) => {
    const s = get()
    // 未载入就结算会用空态覆盖已存修为（total 从 0 起算再写回 = 抹掉历史），
    // 所以宁可这次不结、等载入完成后再由 hook 触发
    if (!s.loaded) return 0
    const today = todayISO()
    const next = settleDaily(s, todayTotal, today)
    if (next.gained === 0 && next.todayDate === s.todayDate) return 0

    const cumulative = totalCultivation({
      total: next.total,
      bonus: s.bonus,
      todayCounted: next.todayCounted,
    })
    const realm = realmOf(cumulative)
    // 只升不降：最高境界取 max，不因任何原因回落
    const bestRank = Math.max(s.bestRank, realm.rank)
    const bestTitle = bestRank === realm.rank ? realm.title : s.bestTitle || realm.title

    set({
      total: next.total,
      todayDate: next.todayDate,
      todayCounted: next.todayCounted,
      bestRank,
      bestTitle,
      bestAt: realm.rank > s.bestRank ? today : s.bestAt,
    })
    await writeCultivationState({
      total: next.total,
      todayDate: next.todayDate,
      todayCounted: next.todayCounted,
      bestRank,
      bestTitle,
      bestAt: realm.rank > s.bestRank ? today : s.bestAt,
      updatedAt: nowISO(),
    })
    notifyDataChanged()
    return next.gained
  },

  grantSeclusion: async (minutes) => {
    const s = get()
    await s.load()
    const gain = seclusionReward(minutes)
    if (gain <= 0) return 0
    const bonus = s.bonus + gain
    const cumulative = totalCultivation({ total: s.total, bonus, todayCounted: s.todayCounted })
    const realm = realmOf(cumulative)
    const bestRank = Math.max(s.bestRank, realm.rank)
    const bestTitle = bestRank === realm.rank ? realm.title : s.bestTitle || realm.title
    set({
      bonus,
      seclusionCount: s.seclusionCount + 1,
      bestRank,
      bestTitle,
      bestAt: realm.rank > s.bestRank ? todayISO() : s.bestAt,
    })
    await writeCultivationState({
      bonus,
      seclusionCount: s.seclusionCount + 1,
      bestRank,
      bestTitle,
      bestAt: realm.rank > s.bestRank ? todayISO() : s.bestAt,
      updatedAt: nowISO(),
    })
    notifyDataChanged()
    return gain
  },
}))
