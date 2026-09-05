/**
 * 道行 hook —— 由今日统计计算五维道行
 */
import { useMemo } from 'react'
import {
  computeCultivation,
  cultivationGrade,
  type CultivationResult,
} from '../services/cultivation'
import { useTodayStats } from './useTodayStats'

export function useCultivation(): {
  result: CultivationResult
  grade: { title: string; desc: string }
} {
  const stats = useTodayStats()

  return useMemo(() => {
    const result = computeCultivation({
      tasksDoneToday: stats.tasksDone,
      focusMinutesToday: stats.focusMinutes,
      waterRatio: stats.waterRatio,
      habitLogsToday: stats.habitLogs,
      bodyLogsToday: stats.bodyLogs,
      journalToday: Boolean(stats.journal),
      journalMood: stats.journal?.mood,
      creationsToday: stats.creations,
    })
    return { result, grade: cultivationGrade(result.total) }
  }, [stats])
}
