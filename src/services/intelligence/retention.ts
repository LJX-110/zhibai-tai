/**
 * 情报保留策略 —— 把「只增不减」变成可控
 *
 * 情报是唯一会**持续自动增长**的业务表：每次抓取每个源最多新增 12 条，
 * 而此前既没有删除入口、也没有数量上限。配合同步「每次都整份序列化再推送」的方式，
 * 结果是快照无限膨胀，最终表现为同步莫名失败、且从报错里看不出原因。
 *
 * 裁剪方式对齐 `services/activity.ts` 已验证过的模式：
 * 删除**必须写墓碑**，否则下次同步会被远端快照原样加回，上限形同虚设。
 *
 * 取舍：优先保留**收藏**，其次保留**未读** —— 用户主动收藏或还没看过的更可能还要看，
 * 而「已读且未收藏、又最旧」的那批留着只是占体积。
 */
import { db } from '../../db/db'
import { markTombstones } from '../../repositories/repo'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { notifyDataChanged } from '../../sync/auto'
import type { IntelligenceItem } from '../../types/entities'

/** 上限的可选档位（0 = 不限制） */
export const KEEP_LIMIT_OPTIONS = [200, 500, 1000, 0] as const

export interface RetentionResult {
  /** 实际删除的条数 */
  removed: number
}

/**
 * 按上限裁剪。
 * 删除优先级：已读未收藏 → 未读未收藏 → 已读收藏 → 未读收藏；
 * 同组内更旧的先删 —— 收藏与未读被尽量留到最后。
 */
export async function pruneIntelligence(limit: number): Promise<RetentionResult> {
  if (limit <= 0) return { removed: 0 }
  const all = await db.intelligenceItems.toArray()
  if (all.length <= limit) return { removed: 0 }

  /** 越小越先删：收藏加 2、未读加 1，于是「已读未收藏」永远排在最前 */
  const deleteRank = (x: IntelligenceItem) => (x.favorite ? 2 : 0) + (x.read ? 0 : 1)
  const ordered = [...all].sort((a, b) => {
    const byRank = deleteRank(a) - deleteRank(b)
    if (byRank !== 0) return byRank
    return (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt)
  })
  const doomed = ordered.slice(0, all.length - limit).map((x) => x.id)
  if (doomed.length === 0) return { removed: 0 }

  await db.transaction('rw', db.intelligenceItems, db.tombstones, async () => {
    await markTombstones('intelligenceItems', doomed)
    await db.intelligenceItems.bulkDelete(doomed)
  })
  // 裁剪同样是本地改动，必须置脏：否则墓碑要等下一次无关写入才传播，
  // 上限内删掉的条目会被远端快照加回，「上限」形同虚设。
  notifyDataChanged()
  return { removed: doomed.length }
}

/**
 * 落库 + 裁剪，抓取的三处调用点共用。
 * 之所以合成一个函数：任何一处漏掉裁剪，快照就会继续无限膨胀，
 * 而这种疏漏在界面上一时看不出来。
 */
export async function saveFetchedItems(
  items: IntelligenceItem[],
): Promise<{ added: number; removed: number }> {
  if (items.length > 0) {
    const ok = await useIntelligenceStore.getState().saveMany(items)
    if (!ok) return { added: 0, removed: 0 }
  }
  const { removed } = await pruneIntelligence(useSettingsStore.getState().intelKeepLimit)
  if (removed > 0) await useIntelligenceStore.getState().load()
  return { added: items.length, removed }
}

/**
 * 清理已读情报（用户显式操作）。
 * **收藏项不动** —— 收藏是用户明确说"这个还要留着"的唯一信号，
 * 清理已读却把它删掉等于绕过用户的意愿。
 * @param before 可选：只清理这个日期（yyyy-mm-dd）之前发布的
 */
export async function clearReadIntelligence(before?: string): Promise<RetentionResult> {
  const all = await db.intelligenceItems.toArray()
  const doomed = all
    .filter((x) => x.read && !x.favorite)
    .filter((x) => !before || (x.publishedAt ?? x.createdAt).slice(0, 10) < before)
    .map((x) => x.id)
  if (doomed.length === 0) return { removed: 0 }
  await db.transaction('rw', db.intelligenceItems, db.tombstones, async () => {
    await markTombstones('intelligenceItems', doomed)
    await db.intelligenceItems.bulkDelete(doomed)
  })
  // 清理是本地改动：置脏，删除的墓碑才不会拖到下一次无关写入才随快照传播（2026-10-20）
  notifyDataChanged()
  return { removed: doomed.length }
}

/** 清空全部情报（用户显式操作） */
export async function clearAllIntelligence(): Promise<RetentionResult> {
  const count = await db.intelligenceItems.count()
  if (count === 0) return { removed: 0 }
  // store.clear() 经 repo 工厂：同一事务内清表并逐行写墓碑，删除会随同步传播
  const ok = await useIntelligenceStore.getState().clear()
  return { removed: ok ? count : 0 }
}
