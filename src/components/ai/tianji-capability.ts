/**
 * 天机的「快捷能力」：一键运行结构化 AI 任务
 * （今日简报 / 学习计划 / 项目摘要 / 总结情报）
 *
 * 只保留能力名：横滚行里名字本身就够辨认，每条再挂两行解释会把行高撑到 52px、
 * 挤掉真正的内容（用户明确要求移除这类小字说明）。
 */
import { Bot, CalendarDays, FileText, GraduationCap, NotebookPen } from 'lucide-react'
import { aiService } from '../../services/ai/ai-service'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useCourseStore, useExamStore, useHomeworkStore } from '../../stores/useStudyStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { useTodayStats } from '../../hooks/useTodayStats'
import { cultivationSources } from '../../services/cultivation'
import { todayISO } from '../../utils/id'

export type TianjiCapabilityKey = 'brief' | 'plan' | 'project' | 'intel'

export const TIANJI_CAPABILITIES: {
  key: TianjiCapabilityKey
  label: string
  icon: typeof Bot
}[] = [
  { key: 'brief', label: '今日简报', icon: CalendarDays },
  { key: 'plan', label: '学习计划', icon: GraduationCap },
  { key: 'project', label: '项目摘要', icon: NotebookPen },
  { key: 'intel', label: '总结情报', icon: FileText },
]

/** 运行快捷能力，返回 (标题, 正文)；失败时抛错由调用方降级处理 */
export async function runTianjiCapability(
  key: TianjiCapabilityKey,
  stats: ReturnType<typeof useTodayStats>,
): Promise<{ title: string; body: string }> {
  const water = useWaterStore.getState().items
  const waterGoal = useSettingsStore.getState().waterGoalMl
  const courses = useCourseStore.getState().items
  const homeworks = useHomeworkStore.getState().items
  const exams = useExamStore.getState().items
  const projects = useProjectStore.getState().items
  const intel = useIntelligenceStore.getState().items

  if (key === 'brief') {
    const date = todayISO()
    const waterMl = water.filter((w) => w.date === date).reduce((s, w) => s + w.amountMl, 0)
    const body = await aiService.dailyBrief({
      date,
      tasksDone: stats.tasksDone,
      focusMin: stats.focusMinutes,
      waterMl,
      goal: waterGoal,
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
  }
  if (key === 'plan') {
    const body = await aiService.studyPlan({
      courses: courses.map((c) => ({ name: c.name })),
      undone: homeworks.filter((h) => !h.done).length,
      exams: exams.map((e) => ({ title: e.title, date: e.date })),
    })
    return { title: '学习计划', body }
  }
  if (key === 'project') {
    const p = projects[0]
    if (!p) {
      return { title: '项目摘要', body: '还没有项目。去「藏 · 项目中心」新建一个项目，天机会为你生成摘要。' }
    }
    const body = await aiService.projectSummary(p)
    return { title: '项目摘要', body }
  }
  const it = [...intel].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!it) {
    return { title: '情报摘要', body: '还没有情报。去「情」拉取一些情报后，天机会为最新一条生成摘要与标签。' }
  }
  const [summary, tags, rank] = await Promise.all([
    aiService.summarize(it),
    aiService.tag(it),
    aiService.rank(it),
  ])
  return {
    title: '情报摘要',
    body: `标题：${it.title}\n摘要：${summary}\n标签：${tags.join('、')}\n重要度：${rank}`,
  }
}
