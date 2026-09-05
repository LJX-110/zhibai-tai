/**
 * Zustand CRUD store 工厂
 * 统一的内存态 + Repository 持久化，避免每个领域重复写样板代码
 * 每次写操作后触发自动同步（notifyDataChanged）
 *
 * P0-A 加固：所有读写操作均做异常捕获。
 * 此前 IndexedDB 配额写满、隐私模式禁用存储等场景下，
 * 写入会静默失败 —— 用户以为已保存，实际未落库且无任何提示。
 * 现在一律提示用户，并返回操作是否成功，供调用方决定后续行为。
 */
import { create } from 'zustand'
import type { Repository } from '../repositories/repo'
import { notifyDataChanged } from '../sync/auto'
// Toast 本质是全局状态而非组件，直接引用其 store 不构成架构反向依赖
import { useToastStore } from '../components/ui/Toast'

export interface CrudState<T extends { id: string }> {
  items: T[]
  loaded: boolean
  /** 最近一次操作失败的原因；成功后自动清空。UI 可据此渲染错误态 */
  error: string | null
  load: () => Promise<boolean>
  add: (item: T) => Promise<boolean>
  /** 新增或覆盖（带 id 时用） */
  save: (item: T) => Promise<boolean>
  /** 批量新增或覆盖（单次落库 + 单次内存合并，抓取/导入场景用） */
  saveMany: (items: T[]) => Promise<boolean>
  update: (id: string, changes: Partial<T>) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  clear: () => Promise<boolean>
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 存储配额写满、隐私模式禁用等不可恢复的存储层故障 */
function isStorageError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const s = `${e.name} ${e.message}`.toLowerCase()
  return s.includes('quota') || s.includes('storage')
}

/**
 * 统一写操作保护：失败时提示用户并返回 false，绝不静默。
 * 调用方可依据返回值决定是否关闭表单、清空输入。
 */
async function guardWrite(
  label: string,
  run: () => Promise<unknown>,
  setError: (msg: string | null) => void,
): Promise<boolean> {
  try {
    await run()
    setError(null)
    return true
  } catch (e) {
    const msg = messageOf(e)
    console.error(`[知白台] 写入失败 · ${label}:`, e)
    setError(msg)
    useToastStore.getState().push(
      isStorageError(e)
        ? '本地存储空间不足，请导出备份后清理旧数据'
        : `保存失败（${label}）：${msg}`,
      'danger',
    )
    return false
  }
}

export function createCrudStore<T extends { id: string }>(
  repo: Repository<T>,
) {
  return create<CrudState<T>>((set, get) => ({
    items: [],
    loaded: false,
    error: null,

    load: async () => {
      try {
        const items = await repo.list()
        set({ items, loaded: true, error: null })
        return true
      } catch (e) {
        console.error('[知白台] 读取失败:', e)
        // 必须置 loaded，否则依赖 loaded 判空的页面会永远停在加载态
        set({ loaded: true, error: messageOf(e) })
        useToastStore.getState().push(`读取本地数据失败：${messageOf(e)}`, 'danger')
        return false
      }
    },

    add: async (item) => {
      const ok = await guardWrite('新增', () => repo.put(item), (error) => set({ error }))
      if (!ok) return false
      set({ items: [...get().items, item] })
      notifyDataChanged()
      return true
    },

    save: async (item) => {
      const ok = await guardWrite('保存', () => repo.put(item), (error) => set({ error }))
      if (!ok) return false
      set({
        items: get().items.some((it) => it.id === item.id)
          ? get().items.map((it) => (it.id === item.id ? item : it))
          : [...get().items, item],
      })
      notifyDataChanged()
      return true
    },

    saveMany: async (items) => {
      if (items.length === 0) return true
      const ok = await guardWrite(
        `批量保存 ${items.length} 条`,
        () => repo.putMany(items),
        (error) => set({ error }),
      )
      if (!ok) return false
      // 已存在的原地覆盖，新条目前插（与列表"最新在前"的排序习惯一致）
      const freshById = new Map(items.map((it) => [it.id, it] as const))
      const existingIds = new Set(get().items.map((it) => it.id))
      set({
        items: [
          ...items.filter((it) => !existingIds.has(it.id)),
          ...get().items.map((it) => freshById.get(it.id) ?? it),
        ],
      })
      notifyDataChanged()
      return true
    },

    update: async (id, changes) => {
      const ok = await guardWrite(
        '更新',
        () => repo.update(id, changes),
        (error) => set({ error }),
      )
      if (!ok) return false
      set({
        items: get().items.map((it) =>
          it.id === id ? { ...it, ...changes } : it,
        ),
      })
      notifyDataChanged()
      return true
    },

    remove: async (id) => {
      const ok = await guardWrite('删除', () => repo.remove(id), (error) => set({ error }))
      if (!ok) return false
      set({ items: get().items.filter((it) => it.id !== id) })
      notifyDataChanged()
      return true
    },

    clear: async () => {
      const ok = await guardWrite('清空', () => repo.clear(), (error) => set({ error }))
      if (!ok) return false
      set({ items: [] })
      notifyDataChanged()
      return true
    },
  }))
}
