/**
 * 学 · 提醒源（课程 / 作业 / 考试）—— 从 `reminders.ts` 拆出（2026-09-23）
 *
 * 拆出的唯一原因是**行数**：`reminders.ts` 已涨到 415 行，超了单文件 400 行的硬规则。
 * 拆法按**域**切而不是"随便凑够行数"：这三个源共用同一批数据（课程 / 作业 / 考试）
 * 与同一批工具（星期、周次、时段），放一起改动天然同步。
 *
 * ⚠️ 与 `reminders.ts` 的关系：输出型别 `DueReminder` 仍住在那边（词表只留一份），
 * 这里是**纯类型**回引，编译后不产生循环依赖。聚合入口也仍在 `reminders.ts`
 * ——`collectReminders` 决定各源的呈现顺序，顺序即语义，不该分散到两个文件。
 */
import type { Course, CourseCancellation, CourseReschedule, Exam, Homework } from '../types/entities'
import { activeSlotsOfDay, currentWeek, upcomingClasses } from './study'
import { toISODate } from '../utils/id'
import type { DueReminder } from './reminders'

/**
 * 课程：提前量提醒 + 当日概览。
 *  · ahead：进入提前量窗口的每一节课，键细到「课 + 开始时间 + 日期」；
 *  · overview：今天还有课没上时给一句概览（今天全上完就不报 ——
 *    旧版用 `?? todayClasses[0]` 兜底，把第一节当"下一节"再报一次，晚上打开就看到早八）。
 *
 * 未设学期起始日时，带周次的课无从判断该不该上 —— 宁可漏报也不错报
 * （用户反馈过「这周不上却仍提醒」），与旧 ClassReminder 的兜底一致。
 */
export function classReminders(
  courses: Course[],
  termStartDate: string | undefined,
  now: Date,
  aheadMin = 15,
  /**
   * 单次停课记录 —— 传进来才可能跳过被停的课。
   * ⚠️ **这就是「课次取消当周仍提醒」的修法**：此前根本没有"取消某一次课"的概念，
   * 提醒无从知道；现在它随取课点一起被剔除。
   */
  cancellations: readonly CourseCancellation[] = [],
  /**
   * 单次调课记录 —— 与停课同源：调走的那次课在**原时间**不再提醒，
   * 而挪到的新时间要有「即将开始」提醒。
   * 两件事都由 `activeSlotsOfDay` 一处完成（剔除调走的 + 补上调来的），
   * 所以这里**两个取课点都要传**（只传一处 = 提前量对了、今日概览照旧按原时间报）。
   */
  reschedules: readonly CourseReschedule[] = [],
): DueReminder[] {
  const today = toISODate(now)
  const week = currentWeek(termStartDate, today)
  const weekday = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const out: DueReminder[] = []

  for (const { course, slot, minutesLeft } of upcomingClasses(courses, weekday, week, minutes, aheadMin, {
    date: today,
    cancellations,
    reschedules,
  })) {
    if (week == null && slot.weeks?.length) continue
    out.push({
      key: `class:${course.id}:${slot.start}:${today}`,
      period: today,
      kind: 'class-ahead',
      title: `${course.name} ${minutesLeft <= 0 ? '即将开始' : `${minutesLeft} 分钟后`}${course.room ? ` · ${course.room}` : ''}`,
      hash: '#/study',
      tone: 'danger',
      critical: true,
    })
  }

  // 当日概览：今天还有课没上时给一句"下一节"。今天全上完就不报 ——
  // 旧版用 `?? todayClasses[0]` 兜底，把第一节当"下一节"再报一次，晚上打开就看到早八
  // ⚠️ 这一处**也必须带停课**：漏了的话"提前量提醒"被停掉、但"今日概览"照旧报
  //（测试 `study-cancellation` 正是这么抓到第一版的漏改的）
  const dayClasses = activeSlotsOfDay(courses, weekday, week, { date: today, cancellations, reschedules })
  const next = dayClasses
    .map(({ course, slot }) => ({ name: course.name, start: slot.start }))
    .sort((a, b) => a.start.localeCompare(b.start))
    .find((c) => c.start > hhmm)
  if (dayClasses.length > 0 && next) {
    out.push({
      key: `classes:overview:${today}`,
      period: today,
      kind: 'classes',
      title: `今日 ${dayClasses.length} 节课 · 下一节 ${next.name} ${next.start}`,
      hash: '#/study',
      tone: 'info',
      critical: false,
    })
  }
  return out
}

/** 作业：已逾期的，以及今明两天截止且未交的 */
export function homeworkReminders(homeworks: Homework[], today: string): DueReminder[] {
  const out: DueReminder[] = []
  for (const hw of homeworks) {
    if (hw.done || !hw.dueDate) continue
    const left = Math.round((Date.parse(`${hw.dueDate}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000)
    if (!Number.isFinite(left)) continue
    if (left < 0) {
      out.push({
        key: `hw:overdue:${hw.id}:${hw.dueDate}`,
        period: today,
        kind: 'homeworks',
        title: `${hw.title}（逾期 ${-left} 天）`,
        hash: '#/study',
        tone: 'danger',
        critical: true,
      })
    } else if (left <= 1) {
      out.push({
        key: `hw:due:${hw.id}:${hw.dueDate}`,
        period: today,
        kind: 'homeworks',
        title: `${hw.title}（${left === 0 ? '今天' : '明天'}截止）`,
        hash: '#/study',
        tone: left === 0 ? 'danger' : 'info',
        critical: left === 0,
      })
    }
  }
  return out
}

/** 考试：只剩 3 天 / 1 天 / 当天，各提醒一次（键含剩余天数，天然每日一次） */
export function examReminders(exams: Exam[], today: string): DueReminder[] {
  const out: DueReminder[] = []
  for (const exam of exams) {
    const left = Math.round((Date.parse(`${exam.date}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000)
    if (!Number.isFinite(left)) continue
    if (left !== 3 && left !== 1 && left !== 0) continue
    const when = left === 0 ? '今天' : left === 1 ? '明天' : '三天后'
    out.push({
      key: `exam:${exam.id}:d${left}`,
      period: today,
      kind: 'exams',
      title: `${exam.title}（${when}考试${exam.location ? ` · ${exam.location}` : ''}）`,
      hash: '#/study',
      tone: left <= 1 ? 'danger' : 'info',
      critical: left <= 1,
    })
  }
  return out
}

/**
 * 习惯：过了晚间门槛仍未达标才提醒（早上提醒是催，晚上提醒是收尾）。
 * 门槛定为 21:00 —— 一天结束前还有时间补救，又不至于在白天反复打扰。
 */
