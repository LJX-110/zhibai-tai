/**
 * 修行 hook —— 功行（总量）与今日炁象（快照）一并给出
 *
 * ⚠️ 两个口径的分工（见 `services/merit.ts` 顶部说明）：
 *  · `merit` / `realm` / `progress` —— **累计功行与境界**，由动作流水逐日累积定阶、只升不降；
 *  · `result` / `grade` —— **今日炁象**（五维快照），只作为首页罗盘的视觉输入，**不参与境界判定**。
 *
 * 结算放在这里：任何用到修行数据的页面都会顺手把"今日净行增量"并进累计功行。
 * 纯函数只补差额（同一天绝不重复累加），所以多处挂载重复调用是安全的。
 */
import { useEffect, useMemo } from 'react'
import {
  computeCultivation,
  cultivationGrade,
  totalCultivation,
  type CultivationGrade,
  type CultivationResult,
} from '../services/cultivation'
import {
  dailyMerit,
  realmOf,
  realmProgress,
  type DailyMerit,
  type RealmProgress,
  type RealmState,
} from '../services/merit'
import { useActivityStore } from '../stores/useLifeStores'
import { useCultivationStore } from '../stores/useCultivationStore'
import { useTodayStats } from './useTodayStats'

export interface CultivationView {
  /** 今日炁象（五维快照）—— 罗盘专用 */
  result: CultivationResult
  /** 今日炁象的阶位（罗盘用，**不是**修行境界） */
  grade: CultivationGrade
  /** 累计功行 = 每日净行 + 闭关额外 */
  merit: number
  /** 修行境界（六境 + 抱朴六轮） */
  realm: RealmState
  progress: RealmProgress
  /** 今日净行（按九板块拆分，供成长页展示"今天修了什么"） */
  today: DailyMerit
  seclusionCount: number
}

export function useCultivation(): CultivationView {
  const stats = useTodayStats()
  const activities = useActivityStore((s) => s.items)
  const total = useCultivationStore((s) => s.total)
  const bonus = useCultivationStore((s) => s.bonus)
  const todayCounted = useCultivationStore((s) => s.todayCounted)
  const seclusionCount = useCultivationStore((s) => s.seclusionCount)
  const settleMerit = useCultivationStore((s) => s.settleMerit)
  const loaded = useCultivationStore((s) => s.loaded)

  // 今日炁象：五维快照（罗盘输入，与境界无关）
  const result = useMemo(
    () =>
      computeCultivation({
        tasksDoneToday: stats.tasksDone,
        focusMinutesToday: stats.focusMinutes,
        waterRatio: stats.waterRatio,
        habitLogsToday: stats.habitLogs,
        bodyLogsToday: stats.bodyLogs,
        notesToday: stats.notesToday,
        creationsToday: stats.creations,
      }),
    [stats],
  )

  // 今日净行：由动作流水算出（九板块，各带每日上限）
  const today = useMemo(() => dailyMerit(activities), [activities])

  // 今日净行一变就补差额进累计功行；纯函数保证同一天只加差额
  useEffect(() => {
    // loaded 必须在依赖里：载入完成前跳过结算（见 store 的守卫），
    // 少了它，载入完成那一刻不会补跑，当天增量就白丢了
    if (loaded) void settleMerit(today.total)
  }, [loaded, settleMerit, today.total])

  const merit = totalCultivation({ total, bonus, todayCounted })
  return useMemo(
    () => ({
      result,
      grade: cultivationGrade(result.total),
      merit,
      realm: realmOf(merit),
      progress: realmProgress(merit),
      today,
      seclusionCount,
    }),
    [result, merit, today, seclusionCount],
  )
}
