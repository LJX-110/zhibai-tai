/**
 * 观 · 首页专属的类型、常量与**纯函数**
 */
import type { Task } from '../../types/entities'

/** 炁象维度（克制，非堆数字） */
export interface QiDim {
  key: string
  label: string
  sub: string
  value: number
  max: number
  tone: 'teal' | 'cinnabar' | 'bronze' | 'plain'
}

export const DIM_COLOR: Record<QiDim['tone'], string> = {
  cinnabar: 'var(--color-cinnabar)',
  teal: 'var(--color-teal)',
  bronze: 'var(--color-gold-btn)',
  plain: 'var(--color-ink-muted)',
}

/* ---------------- 今日任务时间轴（Step 5-1 · E3） ---------------- */

/** 时间轴的三段：越靠前越急 */
export type TimelineBucket = 'overdue' | 'today' | 'soon'

export interface TimelineEntry {
  task: Task
  bucket: TimelineBucket
}

/** 分段的展示顺序与标题（顺序 = 紧迫度） */
export const TIMELINE_GROUPS: { key: TimelineBucket; label: string }[] = [
  { key: 'overdue', label: '逾期' },
  { key: 'today', label: '今天' },
  { key: 'soon', label: '临近' },
]

/**
 * 把三个来源合成**一条**今日任务时间轴。
 *
 * ## 为什么要有这个函数
 * 首页原来分两块：`highPriorityOpen`（今日重点）与 `todayDue + upcoming`（到期提醒）。
 * 一件**今天到期的重点待办同时落进两块** —— 首屏出现两次，用户得先心算"是不是同一件"。
 * 抽成纯函数还有个直接好处：这条"不重复"的规则**可以被单测钉住**（组件内联就没法测）。
 *
 * ## 规则（顺序即优先级，且每条只出现一次）
 *  1. `todayDue`（到期日 ≤ 今天）按到期日分成 **逾期** / **今天**；
 *  2. `upcoming`（1~3 天内）→ **临近**；
 *  3. `focus`（重点待办）里剩下的（多为**没有到期日**的）→ 归到 **今天** ——
 *     它们原本就只出现在「今日任务」里，合并后不能丢。
 *
 * ⚠️ 去重按 `id`（不是标题）：同名待办是两条真实的事（与 `task-repair` 同一条教训）。
 * ⚠️ 越靠前的来源越权威 —— 先放进来的桶不会被后面的覆盖（逾期永远算逾期）。
 */
export function buildTodayTimeline(
  todayDue: readonly Task[],
  upcoming: readonly Task[],
  focus: readonly Task[],
  today: string,
): TimelineEntry[] {
  const seen = new Set<string>()
  const out: TimelineEntry[] = []
  const push = (task: Task, bucket: TimelineBucket) => {
    if (seen.has(task.id)) return
    seen.add(task.id)
    out.push({ task, bucket })
  }
  for (const t of todayDue) push(t, t.dueDate && t.dueDate < today ? 'overdue' : 'today')
  for (const t of upcoming) push(t, 'soon')
  for (const t of focus) push(t, 'today')
  // 同一段内：**有时刻的按时刻排前面**（"有坐标的进时间轴"），
  // 没填时刻的留在同一段但排在后面 —— 不臆造时间，也不打乱原有相对顺序。
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ta = a.e.task.dueTime
      const tb = b.e.task.dueTime
      if (ta && tb) return ta.localeCompare(tb) || a.i - b.i
      if (ta) return -1
      if (tb) return 1
      return a.i - b.i
    })
    .map(({ e }) => e)
}
