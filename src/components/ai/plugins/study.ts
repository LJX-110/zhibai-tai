/**
 * 学 · 插件 —— 排课 / 作业 / 考试明细 + 学习计划
 *
 * 明细区贡献三块（顺序沿用改造前的注入次序）：全部课程排课 → 未交作业 → 待考。
 * 关键词门控在插件内部 —— 问什么补什么，不问就不占 prompt。
 */
import { GraduationCap } from 'lucide-react'
import { aiService } from '../../../services/ai/ai-service'
import { useCourseCancellationStore, useCourseRescheduleStore, useCourseStore, useExamStore, useHomeworkStore } from '../../../stores/useStudyStore'
import { useSettingsStore } from '../../../stores/useSettingsStore'
import { activeSlotsOfDay, currentWeek } from '../../../services/study'
import { defineTool } from '../../../services/agent/tools'
import { diffDays, todayISO, weekdayCN } from '../../../utils/id'
import type { Course } from '../../../types/entities'
import type { TianjiPlugin } from './index'

/** 一门课的全部排课 → 一行可读描述（用于"XX 课什么时候上"这类查询） */
function scheduleOf(course: Course): string {
  if (course.schedule.length === 0) return '未排课'
  const parts = course.schedule
    .slice()
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
    .map((s) => `周${weekdayCN(s.weekday)} ${s.start}-${s.end}`)
  const who = [course.teacher, course.room].filter(Boolean).join(' ')
  return `${course.name}${who ? `（${who}）` : ''}：${parts.join('、')}`
}

/** 截止日 → "今天 / 明天 / 还剩 N 天 / 已逾期 N 天" */
function dueText(due: string): string {
  const d = diffDays(due)
  if (d === 0) return '今天截止'
  if (d === 1) return '明天截止'
  if (d > 0) return `还剩 ${d} 天`
  return `已逾期 ${-d} 天`
}

export const studyPlugin: TianjiPlugin = {
  id: 'study',

  /**
   * 工具：今日课程。
   * 与明细区的差别：明细是"按关键词预先注入"，工具是"模型自己去查" ——
   * 后者在多轮追问（"那明天呢"）里才拿得到新数据，因为每轮都会重跑。
   */
  tools: [
    defineTool({
      id: 'courses.today',
      name: '查今日课程',
      description:
        '取「今天上哪些课」——按当前周次与单双周过滤，已停课 / 已调走的不算、调来的算。问"今天有课吗 / 几点上课 / 在哪上课"时用它。',
      inputSchema: { date: '可选：yyyy-mm-dd（默认今天）' },
      mode: 'read',
      riskLevel: 'read',
      execute: async (args) => {
        const date =
          typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : todayISO()
        const weekday = new Date(`${date}T00:00:00`).getDay()
        const week = currentWeek(useSettingsStore.getState().termStartDate)
        // ⚠️ 取课点必须走 activeSlotsOfDay（含周次 / 停课 / 调课），不要手写按周几过滤
        const slots = activeSlotsOfDay(useCourseStore.getState().items, weekday, week, {
          date,
          cancellations: useCourseCancellationStore.getState().items,
          reschedules: useCourseRescheduleStore.getState().items,
        })
        if (slots.length === 0) return { count: 0, text: `${date} 没有课。` }
        const rows = slots.map(({ course, slot }) => {
          const where = [course.room, course.teacher].filter(Boolean).join(' · ')
          return `- ${slot.start}–${slot.end} ${course.name}${where ? `（${where}）` : ''}`
        })
        return { count: slots.length, text: `${date} 共 ${slots.length} 节：\n${rows.join('\n')}` }
      },
    }),
  ],

  detail: (q) => {
    const courses = useCourseStore.getState().items
    const homeworks = useHomeworkStore.getState().items
    const exams = useExamStore.getState().items
    const lines: string[] = []

    // 课程排课明细：问"某课什么时候上 / 第几周"时要给全部课程的时间表
    if (/课表|排课|什么时候上|哪天上|几点上|时间表|教室/.test(q)) {
      lines.push(`【全部课程排课 · 共 ${courses.length} 门】`)
      for (const c of courses) lines.push(`  ${scheduleOf(c)}${c.credit ? `（${c.credit} 学分）` : ''}`)
    }

    // 作业明细
    if (/作业|交|deadline|截止|期末|平时分/i.test(q)) {
      const undone = homeworks.filter((h) => !h.done)
      const nameOf = (id?: string | null) => courses.find((c) => c.id === id)?.name
      if (undone.length > 0) {
        lines.push(`【未交作业 · 共 ${undone.length} 项】`)
        for (const h of undone) {
          const c = nameOf(h.courseId)
          const due = h.dueDate ? `（${h.dueDate} ${dueText(h.dueDate)}）` : '（无截止日）'
          lines.push(`  ${c ? `${c} — ` : ''}${h.title}${due}`)
        }
      } else {
        lines.push('【未交作业】全部已交')
      }
      const doneCount = homeworks.filter((h) => h.done).length
      lines.push(`  已完成 ${doneCount} 项 / 共 ${homeworks.length} 项`)
    }

    // 考试明细
    if (/考试|考|测验|补考|期末考|期中/.test(q)) {
      const upcoming = exams
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter((e) => diffDays(e.date) >= 0)
      if (upcoming.length > 0) {
        lines.push(`【待考 · 共 ${upcoming.length} 场】`)
        for (const e of upcoming.slice(0, 8)) {
          const c = courses.find((x) => x.id === e.courseId)?.name
          const extra = [e.time, e.location].filter(Boolean).join(' ')
          lines.push(
            `  ${e.title}${c && c !== e.title ? `（${c}）` : ''} ${e.date}${extra ? ` ${extra}` : ''} — ${dueText(e.date)}`,
          )
        }
      } else {
        lines.push('【待考】近期没有安排的考试')
      }
    }

    return lines
  },

  capability: {
    key: 'plan',
    label: '学习计划',
    icon: GraduationCap,
    run: async () => {
      const courses = useCourseStore.getState().items
      const homeworks = useHomeworkStore.getState().items
      const exams = useExamStore.getState().items
      const body = await aiService.studyPlan({
        courses: courses.map((c) => ({ name: c.name })),
        undone: homeworks.filter((h) => !h.done).length,
        exams: exams.map((e) => ({ title: e.title, date: e.date })),
      })
      return { title: '学习计划', body }
    },
  },
}
