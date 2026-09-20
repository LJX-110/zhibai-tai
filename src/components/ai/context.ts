/**
 * 天机的数据上下文 —— 分「基础区」与「按问题注入的明细区」
 *
 * 此前只有汇总口径（"课程 3 门"），所以问"今天有几节课"答不上来：
 * 汇总里根本没有排课时间。但也不能把整个库塞进每次请求（prompt 长度与成本），
 * 于是按问题关键词补明细区块；今日课表因为最高频，无条件注入。
 *
 * 放在 components 层而非 services：这里要直接读各 store，
 * 而 services 层按项目约定只向下依赖 repositories。
 */
import { useBodyMetricLogStore } from '../../stores/useBodyStore'
import { useCollectionStore } from '../../stores/useCollectionStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useHabitLogStore } from '../../stores/useHabitStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useCourseStore, useExamStore, useHomeworkStore } from '../../stores/useStudyStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { activeSlotsOfDay, currentWeek } from '../../services/study'
import { diffDays, todayISO, weekdayCN, todayWeekday } from '../../utils/id'
import type { Course } from '../../types/entities'

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

export function buildContext(question: string): string {
  const q = question
  const today = todayISO()
  const month = today.slice(0, 7)
  const weekday = todayWeekday()
  const lines: string[] = []

  const tasks = useTaskStore.getState().items
  const courses = useCourseStore.getState().items
  const homeworks = useHomeworkStore.getState().items
  const exams = useExamStore.getState().items
  const intel = useIntelligenceStore.getState().items
  const fins = useFinanceStore.getState().items
  const projects = useProjectStore.getState().items
  const waterLogs = useWaterStore.getState().items
  const habitLogs = useHabitLogStore.getState().items
  const bodyLogs = useBodyMetricLogStore.getState().items
  const collections = useCollectionStore.getState().items

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

  // ---------- 按问题注入的明细区 ----------

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

  // 财务明细
  if (/钱|花|支出|收入|账|预算|买|消费|花了/.test(q)) {
    const monthExpense = fins.filter((f) => f.kind === 'expense' && f.date.startsWith(month))
    const byCat = new Map<string, number>()
    for (const f of monthExpense) {
      const k = f.category || '未分类'
      byCat.set(k, (byCat.get(k) ?? 0) + f.amount)
    }
    const ranked = [...byCat.entries()].sort((a, b) => b[1] - a[1])
    if (ranked.length > 0) {
      lines.push('【本月支出分类】')
      for (const [k, v] of ranked.slice(0, 8)) lines.push(`  ${k} ¥${v.toFixed(2)}`)
    }
    const recent = fins.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    if (recent.length > 0) {
      lines.push('【最近 5 笔】')
      for (const f of recent) {
        lines.push(`  ${f.date} ${f.kind === 'income' ? '收' : '支'} ¥${f.amount.toFixed(2)} ${f.merchant || f.category || ''}`)
      }
    }
  }

  // 项目明细
  if (/项目|里程碑|进度|开发/.test(q)) {
    if (projects.length > 0) {
      lines.push(`【项目 · 共 ${projects.length} 个】`)
      for (const p of projects.slice(0, 8)) {
        const ms = p.milestones.filter((m) => m.done).length
        const next = p.nextStep ? ` · 下一步：${p.nextStep}` : ''
        lines.push(`  ${p.name}（${p.status} ${p.progress}%，里程碑 ${ms}/${p.milestones.length}）${next}`)
      }
    } else {
      lines.push('【项目】还没有项目')
    }
  }

  // 收藏 / 藏品明细
  if (/收藏|藏品|动漫|小说|游戏|影视|书|在看|追/.test(q)) {
    if (collections.length > 0) {
      const byType = new Map<string, number>()
      for (const c of collections) byType.set(c.type, (byType.get(c.type) ?? 0) + 1)
      lines.push(
        `【收藏 · 共 ${collections.length} 项】${[...byType.entries()].map(([t, n]) => `${t} ${n}`).join(' · ')}`,
      )
      const latest = collections.slice().sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 6)
      lines.push(`  最近：${latest.map((c) => `${c.title}${c.status ? `（${c.status}）` : ''}`).join('、')}`)
    } else {
      lines.push('【收藏】还没有收藏内容')
    }
  }

  // 习惯 / 身体明细
  if (/习惯|斩|打卡|身体|体重|喝水|饮水/.test(q)) {
    const todayHabits = habitLogs.filter((l) => l.date === today)
    lines.push(`【今日打卡】斩三尸 ${todayHabits.length} 次 · 身体记录 ${bodyLogs.filter((l) => l.date === today).length} 条 · 饮水 ${waterToday}ml`)
    const recentBody = bodyLogs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    for (const b of recentBody) lines.push(`  身体 ${b.date}${b.note ? ` ${b.note}` : ''}`)
  }

  return lines.join('\n')
}
