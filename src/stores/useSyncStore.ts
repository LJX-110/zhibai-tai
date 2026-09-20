/**
 * 同步 store —— 同步元数据（持久化）
 */
import { create } from 'zustand'
import { syncMetaRepo } from '../repositories/sync-repo'
import type { SyncMeta } from '../types/entities'

interface SyncStore {
  meta: SyncMeta | null
  load: () => Promise<void>
  refresh: () => Promise<void>
}

export const useSyncStore = create<SyncStore>((set) => ({
  meta: null,
  load: async () => {
    const meta = (await syncMetaRepo.get('meta')) ?? null
    set({ meta })
  },
  refresh: async () => {
    const meta = (await syncMetaRepo.get('meta')) ?? null
    set({ meta })
  },
}))
