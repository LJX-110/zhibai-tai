/**
 * 待办数据修复 —— 清理固定任务的历史重复副本
 *
 * **背景**：旧版完成固定任务（每日/每周/每月）时会额外生成一条后继副本，而"本期已做"
 * 只看 `completedAt` 落在哪个周期 —— 上周完成的旧副本本周又被判成"本期未做"，
 * 于是每周重新出现在固定区，一周多一条，永远复发。
 *
 * 生成逻辑已在 `hooks/useTaskActions` 堵住（固定任务不再生成后继），展示层也已改为
 * 只认"在世记录"（`utils/id.ts` 的 `liveFixedTasks`）。剩下的就是**存量副本**：
 * 它们不再影响固定区显示，但会让「已完成」列表持续虚高、同步快照无谓变大。
 * 这里提供一次性的显式清理。
 *
 * ⚠️ 只删**已完成的旧副本**（见 `findDuplicateFixedTasks`）：未完成的记录可能是用户
 * 真的还没做的事，删掉等于凭空抹掉一条待办。宁可少清，不可误删。
 * 删除一律走 store 工厂 —— 才拿得到墓碑（删除可跨设备传播）与 LWW 合并。
 *
 * 副作用要说清：旧副本也是**真实的完成历史**（用户当时确实点了完成），删掉后
 * 「已完成」列表里对应条目会一起消失。这是清理的代价，不能瞒着用户。
 */
import type { Task } from '../types/entities'
import { useTaskStore } from '../stores/useTaskStore'
import { findDuplicateFixedTasks } from '../utils/id'

export interface DuplicatePreview {
  /** 将被删除的记录数 */
  removable: number
  /** 涉及多少个逻辑任务 */
  groups: number
  /** 涉及的标题（去重，供确认弹窗展示） */
  titles: string[]
}

/** 预览：不写库，只算出"如果清理会删掉什么" */
export function previewDuplicateFixedTasks(tasks: Task[]): DuplicatePreview {
  const groups = findDuplicateFixedTasks(tasks)
  const titles: string[] = []
  let removable = 0
  for (const g of groups) {
    removable += g.removable.length
    if (!titles.includes(g.title)) titles.push(g.title)
  }
  return { removable, groups: groups.length, titles }
}

/** 执行清理：删除固定任务的历史重复副本，返回实际删除数 */
export async function cleanupDuplicateFixedTasks(): Promise<{ removed: number; groups: number }> {
  const st = useTaskStore.getState()
  if (!st.loaded) await st.load()
  const groups = findDuplicateFixedTasks(useTaskStore.getState().items)
  let removed = 0
  for (const g of groups) {
    for (const t of g.removable) {
      await useTaskStore.getState().remove(t.id)
      removed += 1
    }
  }
  return { removed, groups: groups.length }
}
