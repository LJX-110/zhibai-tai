/**
 * 学 · 插件 —— 排课 / 作业 / 考试明细 + 学习计划
 *
 * 明细区贡献三块（顺序沿用改造前的注入次序）：全部课程排课 → 未交作业 → 待考。
 * 关键词门控在插件内部 —— 问什么补什么，不问就不占 prompt。
 */
import { GraduationCap } from 'lucide-react'
import { aiService } from '../../../services/ai/ai-service'
import { useCourseStore, useExamStore, useHomeworkStore } from '../../../stores/useStudyStore'
import { diffDays, weekdayCN } from '../../../utils/id'
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
