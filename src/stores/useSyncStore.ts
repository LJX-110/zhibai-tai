/**
 * 同步 store —— 待同步数量 / 元数据（持久化）
 */
import { create } from 'zustand'
import { syncMetaRepo, syncQueueRepo } from '../repositories/sync-repo'
import type { SyncMeta } from '../types/entities'

interface SyncStore {
  pending: number
  meta: SyncMeta | null
  load: () => Promise<void>
  refresh: () => Promise<void>
}

export const useSyncStore = create<SyncStore>((set) => ({
  pending: 0,
  meta: null,
  load: async () => {
    const [pending, meta] = await Promise.all([
      syncQueueRepo.list().then((q) => q.length),
      syncMetaRepo.get('meta'),
    ])
    set({ pending, meta: meta ?? null })
  },
  refresh: async () => {
    const pending = (await syncQueueRepo.list()).length
    const meta = (await syncMetaRepo.get('meta')) ?? null
    set({ pending, meta })
  },
}))
