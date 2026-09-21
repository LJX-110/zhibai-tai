/**
 * 学 · 共享常量与工具（课程表 / 番茄钟 / 考试共用，从 StudyPage 拆出）
 */

import type { Course } from '../../types/entities'

export function courseLabel(c: Pick<Course, 'name' | 'room'>): string {
  return c.name?.trim() || c.room?.trim() || '未命名课程'
}

/* ---------------- 课程表（Time Grid） ---------------- */

/** 固定时段（08:00–20:40） */
const SLOTS = [
  { key: '0800', label: '第 1 节', start: '08:00', end: '09:40' },
  { key: '1000', label: '第 2 节', start: '10:00', end: '11:40' },
  { key: '1400', label: '第 3 节', start: '14:00', end: '15:40' },
  { key: '1600', label: '第 4 节', start: '16:00', end: '17:40' },
  { key: '1900', label: '第 5 节', start: '19:00', end: '20:40' },
]

export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六']

/** 常见大节的近似标注（时段自定义后仅作参考，匹配不到就不显示） */
export function sectionLabelOf(start: string): string | undefined {
  return SLOTS.find((s) => s.start === start)?.label
}

/** 克制的课程识别色（浅底 + 强调字色 + 细边框） */
const COURSE_COLORS = [
  'bg-teal/10 text-teal border-teal/25',
  'bg-cinnabar/8 text-cinnabar border-cinnabar/20',
  'bg-bronze/14 text-bronze border-bronze/30',
  'bg-mist/50 text-ink-soft border-line-strong',
]

/** 课程左侧实色条（与 COURSE_COLORS 同哈希映射）。
 *  用高不透明度实色：半透明 60% 在米白底上几乎看不见（截图反馈色条太淡） */
const COURSE_BARS = [
  'bg-teal/85',
  'bg-cinnabar/85',
  'bg-bronze/85',
  'bg-ink-soft/60',
]

export function colorFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COURSE_COLORS[h % COURSE_COLORS.length]
}

export function barFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COURSE_BARS[h % COURSE_BARS.length]
}

