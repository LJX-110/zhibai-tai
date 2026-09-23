/**
 * 待办域共享常量 —— 优先级的**单一事实源**
 *
 * 此前「急/中/缓」这套标签散在两处：`TaskEditor` 里硬编码的 `<option>`，
 * 以及 `TaskItem` 里的 `priorityLabel`。改一处忘另一处就会出现
 * "编辑框里叫『急』、列表里叫别的"这类对不上的问题，故收拢到这里。
 */
import type { Priority, Task } from '../../types/entities'

/** 优先级的显示名：急 / 中 / 缓 */
export const PRIORITY_LABEL: Record<Priority, string> = {
  high: '急',
  mid: '中',
  low: '缓',
}

/** 优先级徽标取色（与既有 Badge tone 对齐；低优先不取色，避免满屏彩色） */
export const PRIORITY_TONE: Record<Priority, 'cinnabar' | 'bronze' | 'plain'> = {
  high: 'cinnabar',
  mid: 'bronze',
  low: 'plain',
}

/**
 * 呈现与排序都遵循「急 → 中 → 缓」。
 * 与 `PRIORITY_LABEL` 同源，所以将来加档位只改这两处。
 */
export const PRIORITY_ORDER: Priority[] = ['high', 'mid', 'low']

/** 排序位次：越小越靠前（急=0）—— 只服务于下面的比较器，不外传 */
function priorityRank(p: Priority): number {
  const i = PRIORITY_ORDER.indexOf(p)
  return i === -1 ? PRIORITY_ORDER.length : i
}

/**
 * 待办的标准排序：**先按急/中/缓，再按到期日**（无到期日排最后）。
 *
 * 优先级是用户显式表达"先做哪个"的意图，比日期更该说了算；
 * 同档内再看日期，才不会把「缓但今天到期」压在「急但下月到期」后面。
 */
export function byPriorityThenDue(a: Pick<Task, 'priority' | 'dueDate'>, b: Pick<Task, 'priority' | 'dueDate'>): number {
  const r = priorityRank(a.priority) - priorityRank(b.priority)
  if (r !== 0) return r
  return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
}
