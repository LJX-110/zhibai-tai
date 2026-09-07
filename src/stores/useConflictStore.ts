/**
 * 冲突 store —— 记录与处理同步冲突（LWW 自动取新 + 人工可选）
 */
import { create } from 'zustand'
import { db } from '../db/db'
import { notifyDataChanged } from '../sync/auto'
import type { ConflictRecord } from '../types/entities'

interface ConflictState {
  items: ConflictRecord[]
  pendingCount: number
  load: () => Promise<void>
  /** 标记已解决（用户已选择） */
  resolve: (id: string, chosen: 'local' | 'remote') => Promise<void>
}

export const useConflictStore = create<ConflictState>((set, get) => ({
  items: [],
  pendingCount: 0,
  load: async () => {
    const items = await db.conflicts.orderBy('createdAt').reverse().toArray()
    const pendingCount = items.filter((c) => !c.resolved).length
    set({ items, pendingCount })
  },
  resolve: async (id, chosen) => {
    const conflict = get().items.find((c) => c.id === id)
    if (!conflict) return
    // 将选定版本写回对应表
    const pick = chosen === 'local' ? conflict.local : conflict.remote
    if (pick && typeof pick === 'object' && 'id' in pick) {
      // 手动选定的版本视为"最终修改"：刷新 updatedAt 保证后续 LWW 合并认可，
      // 并通知自动同步（否则选定结果只落本地、其他设备拿不到）
      const rec = { ...pick } as Record<string, unknown>
      const now = new Date().toISOString()
      rec['updatedAt'] = now
      if (rec['createdAt'] === undefined) rec['createdAt'] = now
      await db.table(conflict.entity).put(rec as never)
      notifyDataChanged()
    }
    await db.conflicts.update(id, { resolved: true, resolvedAt: new Date().toISOString() })
    await get().load()
  },
}))
