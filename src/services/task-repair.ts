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
import { findDuplicateFixedTasks, fixedTaskIdentity, isFixedSchedule } from '../utils/id'

/**
 * 认定为「同一条副本链」所需的最小相邻创建间隔 —— 18 小时。
 *
 * 取值理由：旧版生成的后继副本**每个周期一条**，每日固定相隔 24 小时、每周相隔 7 天，
 * 必然远超这个值；而用户手动重复建两条同名任务，几乎总在同一分钟内完成。
 * 于是这一条判据就能把「副本链」与「真的建了两条」分开 —— 前者要合并，
 * 后者**绝不能合并**（合并会让其中一条在界面上静默消失）。
 */
const CHAIN_GAP_MS = 18 * 60 * 60 * 1000

/** 按 createdAt 升序后，相邻两条是否都隔了至少一个"周期量级" */
function looksLikeChain(sorted: Task[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].createdAt).getTime()
    const cur = new Date(sorted[i].createdAt).getTime()
    // 时间戳不可解析时**不合并**：宁可漏合并（保持现状），不可误合并
    if (Number.isNaN(prev) || Number.isNaN(cur)) return false
    if (cur - prev < CHAIN_GAP_MS) return false
  }
  return true
}

/**
 * 幂等迁移：给**存量**固定任务补上 `seriesId`（系列标识）。
 *
 * ## 为什么需要
 * 展示层靠 `seriesId` 把各期认成一件事，而存量数据没有这个字段 ——
 * 只能退回「锚点 + 标题」，于是两个方向都错：
 *  · **改标题 / 改锚点日** → 旧记录被当成另一件事复活，重复条目又回来了；
 *  · **同名任务** → 被认成同一件事，只显示最新那条，另一条静默消失。
 * 补上 `seriesId` 后两条一起消失（新数据在建/改时就已带上，见 `TaskEditor`）。
 *
 * ## 判定规则（保守优先）
 *  · 只有一条 → `seriesId = 自己`；
 *  · 多条且相邻创建间隔都 ≥18 小时 → 是旧版留下的**副本链**，整组共用一个 `seriesId`
 *    （= 最新那条的 id），与原先按标题成组的结果**逐位一致**，清理逻辑照常生效；
 *  · 多条但间隔很近 → 是用户**真的建了两条**同名任务，各自独立成系列 ——
 *    **不合并、不清理**（合并等于让其中一条消失，比"显示两条"严重得多）。
 *
 * 幂等：已经有 `seriesId` 的记录直接跳过；返回本次补了几条。
 */
export async function migrateFixedTaskSeries(): Promise<number> {
  const st = useTaskStore.getState()
  if (!st.loaded) await st.load()

  const groups = new Map<string, Task[]>()
  for (const t of useTaskStore.getState().items) {
    if (!isFixedSchedule(t) || t.seriesId) continue
    const key = fixedTaskIdentity(t)
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }

  let migrated = 0
  for (const list of groups.values()) {
    if (list.length === 1) {
      await useTaskStore.getState().update(list[0].id, { seriesId: list[0].id })
      migrated += 1
      continue
    }
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const seriesId = looksLikeChain(sorted) ? sorted[sorted.length - 1].id : null
    for (const t of sorted) {
      // seriesId 为 null 时按「各自独立」补：不给它们共用键，就不会被误合并
      await useTaskStore.getState().update(t.id, { seriesId: seriesId ?? t.id })
      migrated += 1
    }
  }
  return migrated
}

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
