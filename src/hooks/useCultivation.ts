/**
 * 修行 hook —— 今日道行（快照）与修行境界（累积）一并给出
 *
 * ⚠️ 两者口径不同，别混（见 services/cultivation.ts 的说明）：
 *  · `grade`   今日道行：当天功夫的**快照**，不记录就回落 —— 这是对的。
 *  · `realm`   修行境界：由**累计修为**定阶，只升不降。
 *  · `progress` 距下一阶的进度，供成长页展示。
 *
 * 结算放在这里：任何用到成长数据的页面都会顺手把"今日增量"并进累计修为。
 * 纯函数只补差额（同一天绝不重复累加），所以多处挂载重复调用是安全的。
 */
import { useEffect, useMemo } from 'react'
import {
  computeCultivation,
  cultivationGrade,
  realmOf,
  realmProgress,
  totalCultivation,
  type CultivationGrade,
  type CultivationResult,
} from '../services/cultivation'
import { useCultivationStore } from '../stores/useCultivationStore'
import { useTodayStats } from './useTodayStats'

export function useCultivation(): {
  result: CultivationResult
  /** 今日道行（快照） */
  grade: CultivationGrade
  /** 累计修为 = 每日累计 + 闭关额外 */
  cumulative: number
  /** 修行境界（累计口径，只升不降） */
  realm: CultivationGrade
  progress: ReturnType<typeof realmProgress>
  seclusionCount: number
  /** 今日道行总分（并入累计修为的来源） */
  todayTotal: number
} {
  const stats = useTodayStats()
  const total = useCultivationStore((s) => s.total)
  const bonus = useCultivationStore((s) => s.bonus)
  const todayCounted = useCultivationStore((s) => s.todayCounted)
  const seclusionCount = useCultivationStore((s) => s.seclusionCount)
  const settleToday = useCultivationStore((s) => s.settleToday)
  const loaded = useCultivationStore((s) => s.loaded)

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

  // 今日道行一变就补差额进累计修为；纯函数保证同一天只加差额
  useEffect(() => {
    // loaded 必须在依赖里：载入完成前跳过结算（见 store 的守卫），
    // 少了它，载入完成那一刻不会补跑，当天增量就白丢了
    if (loaded) void settleToday(result.total)
  }, [loaded, settleToday, result.total])

  const cumulative = totalCultivation({ total, bonus, todayCounted })
  return useMemo(
    () => ({
      result,
      grade: cultivationGrade(result.total),
      cumulative,
      realm: realmOf(cumulative),
      progress: realmProgress(cumulative),
      seclusionCount,
      todayTotal: result.total,
    }),
    [result, cumulative, seclusionCount],
  )
}
