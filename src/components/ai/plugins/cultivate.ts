/**
 * 修 · 插件 —— 习惯 / 身体 / 饮水的当日明细
 *
 * 基础概览里已有"饮水·打卡·身体记录"一条；这里补的是追问型明细（当日打卡 + 最近三条身体记录）。
 */
import { useBodyMetricLogStore } from '../../../stores/useBodyStore'
import { useHabitLogStore } from '../../../stores/useHabitStore'
import { useWaterStore } from '../../../stores/useWaterStore'
import { todayISO } from '../../../utils/id'
import type { TianjiPlugin } from './index'

export const cultivatePlugin: TianjiPlugin = {
  id: 'cultivate',

  detail: (q) => {
    if (!/习惯|斩|打卡|身体|体重|喝水|饮水/.test(q)) return []
    const today = todayISO()
    const habitLogs = useHabitLogStore.getState().items
    const bodyLogs = useBodyMetricLogStore.getState().items
    const waterToday = useWaterStore
      .getState()
      .items.filter((w) => w.date === today)
      .reduce((s, w) => s + w.amountMl, 0)

    const lines: string[] = []
    const todayHabits = habitLogs.filter((l) => l.date === today)
    lines.push(
      `【今日打卡】斩三尸 ${todayHabits.length} 次 · 身体记录 ${bodyLogs.filter((l) => l.date === today).length} 条 · 饮水 ${waterToday}ml`,
    )
    const recentBody = bodyLogs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    for (const b of recentBody) lines.push(`  身体 ${b.date}${b.note ? ` ${b.note}` : ''}`)
    return lines
  },
}
