/**
 * 天机的数据上下文 —— 分「基础区」与「按问题注入的明细区」
 *
 * 此前只有汇总口径（"课程 3 门"），所以问"今天有几节课"答不上来：
 * 汇总里根本没有排课时间。但也不能把整个库塞进每次请求（prompt 长度与成本），
 * 于是按问题关键词补明细区块；今日课表因为最高频，无条件注入。
 *
 * **明细区已插件化**：判定逻辑在各板块插件（`./plugins/*.ts`）里，这里只做聚合
 * （`buildDetailContext`），中心文件不再出现"作业/考试/财务/收藏"这类字样 ——
 * 加一个新板块的明细不必再改本文件。基础区是跨板块的每日概览，仍留在此。
 *
 * 放在 components 层而非 services：这里要直接读各 store，
 * 而 services 层按项目约定只向下依赖 repositories。
 */
import { useBodyMetricLogStore } from '../../stores/useBodyStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useHabitLogStore } from '../../stores/useHabitStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { activeSlotsOfDay, currentWeek } from '../../services/study'
import { todayISO, weekdayCN, todayWeekday } from '../../utils/id'
import { buildDetailContext } from './plugins'

export function buildContext(question: string): string {
  const today = todayISO()
  const month = today.slice(0, 7)
  const weekday = todayWeekday()
  const lines: string[] = []

  const tasks = useTaskStore.getState().items
  const courses = useCourseStore.getState().items
  const intel = useIntelligenceStore.getState().items
  const fins = useFinanceStore.getState().items
  const waterLogs = useWaterStore.getState().items
  const habitLogs = useHabitLogStore.getState().items
  const bodyLogs = useBodyMetricLogStore.getState().items

  lines.push(`今天日期：${today}（周${weekdayCN(weekday)}）`)

  // ---------- 基础区：每天的常规概览 ----------
  const open = tasks.filter((t) => !t.done)
  const todayTasks = open.filter((t) => t.dueDate?.startsWith(today))
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today)
  const doneToday = tasks.filter((t) => t.done && t.completedAt?.startsWith(today)).length

  if (todayTasks.length > 0) {
    lines.push(`今日待办：${todayTasks.slice(0, 8).map((t) => t.title).join('、')}`)
  } else if (open.length > 0) {
    lines.push(`待办共 ${open.length} 项（今日无明确到期），最近：${open.slice(0, 5).map((t) => t.title).join('、')}`)
  } else {
    lines.push('暂无待办')
  }
  if (overdue.length > 0) {
    lines.push(`已逾期 ${overdue.length} 项：${overdue.slice(0, 4).map((t) => `${t.title}（${t.dueDate}）`).join('、')}`)
  }
  if (doneToday > 0) lines.push(`今日已完成 ${doneToday} 项待办`)

  const income = fins.filter((f) => f.kind === 'income' && f.date.startsWith(month)).reduce((s, f) => s + f.amount, 0)
  const expense = fins.filter((f) => f.kind === 'expense' && f.date.startsWith(month)).reduce((s, f) => s + f.amount, 0)
  const waterToday = waterLogs.filter((w) => w.date === today).reduce((s, w) => s + w.amountMl, 0)
  lines.push(`本月收入 ¥${income.toFixed(2)} · 支出 ¥${expense.toFixed(2)}（可追问明细）`)
  lines.push(
    `今日饮水 ${waterToday}/${useSettingsStore.getState().waterGoalMl}ml · 斩三尸打卡 ${habitLogs.filter((l) => l.date === today).length} 次 · 身体记录 ${bodyLogs.filter((l) => l.date === today).length} 条`,
  )
  if (intel.length > 0) {
    lines.push(`情报 ${intel.length} 条（未读 ${intel.filter((it) => !it.read).length}），最新：${intel.slice(0, 3).map((i) => i.title).join('、')}`)
  }

  // ---------- 今日课表：无条件注入（最高频的问题就是"今天有什么课"）----------
  const week = currentWeek(useSettingsStore.getState().termStartDate)
  const todaySlots = activeSlotsOfDay(courses, weekday, week)
  if (todaySlots.length > 0) {
    lines.push(`【今日课表 · 第 ${week ?? '?'} 周 · 共 ${todaySlots.length} 节】`)
    for (const { course, slot } of todaySlots) {
      const where = [course.room && `@${course.room}`, course.teacher].filter(Boolean).join(' ')
      lines.push(`  ${slot.start}-${slot.end} ${course.name}${where ? ` ${where}` : ''}`)
    }
  } else if (courses.length > 0) {
    lines.push('【今日课表】今天没有课')
  }

  // ---------- 按问题注入的明细区（全部判定在各板块插件里）----------
  lines.push(...buildDetailContext(question))

  return lines.join('\n')
}
