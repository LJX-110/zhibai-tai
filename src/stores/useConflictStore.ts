/**
 * 冲突 store —— 记录与处理同步冲突（LWW 自动取新 + 人工可选）
 */
import { create } from 'zustand'
import { db } from '../db/db'
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
      await db.table(conflict.entity).put(pick as never)
    }
    await db.conflicts.update(id, { resolved: true, resolvedAt: new Date().toISOString() })
    await get().load()
  },
}))
