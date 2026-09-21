/**
 * 观 · 插件 —— 今日简报
 *
 * 简报要跨板块取材（待办/专注/饮水/打卡/创作），所以它天生属于"观"，
 * 而不是塞回某个具体业务板块。
 */
import { CalendarDays } from 'lucide-react'
import { aiService } from '../../../services/ai/ai-service'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import { useWaterStore } from '../../../stores/useWaterStore'
import { cultivationSources } from '../../../services/cultivation'
import { todayISO } from '../../../utils/id'
import type { TianjiPlugin } from './index'

export const overviewPlugin: TianjiPlugin = {
  id: 'overview',
  capability: {
    key: 'brief',
    label: '今日简报',
    icon: CalendarDays,
    run: async ({ stats }) => {
      const date = todayISO()
      const waterMl = useWaterStore
        .getState()
        .items.filter((w) => w.date === date)
        .reduce((s, w) => s + w.amountMl, 0)
      const body = await aiService.dailyBrief({
        date,
        tasksDone: stats.tasksDone,
        focusMin: stats.focusMinutes,
        waterMl,
        goal: useSettingsStore.getState().waterGoalMl,
        sources: cultivationSources({
          tasksDoneToday: stats.tasksDone,
          focusMinutesToday: stats.focusMinutes,
          waterRatio: stats.waterRatio,
          habitLogsToday: stats.habitLogs,
          bodyLogsToday: stats.bodyLogs,
          notesToday: stats.notesToday,
          creationsToday: stats.creations,
        }),
      })
      return { title: '今日简报', body }
    },
  },
}
