/**
 * 选课规划 store —— 条目（多行）与目标 / 事项（单行）
 *
 * ## 为什么一个文件里放两个 store
 * 它们描述的是同一件事（选课规划），只是形状不同：条目天然多行、目标天然单行。
 * 多行那个直接用 `createCrudStore` 工厂（墓碑 / LWW / 同步 / 即时刷新全套自带）；
 * 单行那个**手写**（工厂是给多行表用的），纪律与 `usePetStore` 一致。
 *
 * ⚠️ **写入前先 `load()`，未载入不落库** —— 否则会用内存里的空态把已存的目标与事项覆盖掉
 * （修行 / 桌宠都踩过这个坑）。
 */
import { create } from 'zustand'
import { coursePlanMetaRepo, coursePlanRepo } from '../repositories/course-plan-repo'
import { notifyDataChanged } from '../sync/auto'
import type { CoursePlan, CoursePlanMeta } from '../types/entities'
import { nowISO } from '../utils/id'
import { createCrudStore } from './factory'

/** 选课条目（多行表）：add / save / update / remove / saveMany 全套来自工厂 */
export const useCoursePlanStore = createCrudStore<CoursePlan>(coursePlanRepo)

/** 内存里的"还不知道"状态。**刻意不是 8/12/1** —— 带默认值的是仓储的 `createEmpty` */
const UNKNOWN_GOALS: CoursePlanMeta['goals'] = { limited: 0, public: 0, pe: 0 }

export interface CoursePlanMetaState {
  /** 是否已从库里载入过（写入前的守卫） */
  loaded: boolean
  goals: CoursePlanMeta['goals']
  notes: string[]
  load: () => Promise<void>
  /** 改某一个方向的目标学分 */
  setGoal: (kind: CoursePlanKindKey, value: number) => Promise<void>
  /** 整段替换事项列表 */
  setNotes: (notes: string[]) => Promise<void>
}

type CoursePlanKindKey = keyof CoursePlanMeta['goals']

/** 目标学分规整：非有限值 / 负数一律记 0（一个 NaN 能把整页进度算废） */
function normalizeGoal(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0
}

export const useCoursePlanMetaStore = create<CoursePlanMetaState>((set, get) => ({
  loaded: false,
  /**
   * 载入前显示 0（而不是 8/12/1）：内存态只该如实反映"还不知道"，
   * 否则首屏会先亮出一个假目标再被真实值替掉。
   * 真正的默认值在 `coursePlanMetaRepo` 的 `createEmpty` 里 —— 那是"从未落库时写什么"。
   */
  goals: UNKNOWN_GOALS,
  notes: [],

  load: async () => {
    const row = await coursePlanMetaRepo.read()
    set({
      goals: row?.goals ?? UNKNOWN_GOALS,
      notes: row?.notes ?? [],
      loaded: true,
    })
  },

  setGoal: async (kind, value) => {
    if (!get().loaded) await get().load()
    const goals = { ...get().goals, [kind]: normalizeGoal(value) }
    set({ goals })
    void coursePlanMetaRepo.write({ goals, updatedAt: nowISO() }).then(() => notifyDataChanged())
  },

  setNotes: async (notes) => {
    if (!get().loaded) await get().load()
    set({ notes })
    void coursePlanMetaRepo.write({ notes, updatedAt: nowISO() }).then(() => notifyDataChanged())
  },
}))
