/**
 * 启动引导 —— 挂载时加载全部领域数据到 store，并向 App 汇报"就绪"
 *
 * P1 修复：此前加载是"发射后不管"，页面在数据到达前就渲染，
 * 冷启动会先闪现"空数据"再跳变。现在：
 *  · 复用 reloadAllStores 单一事实源（不再维护第二份 store 清单）
 *  · 全部就绪后通过 useBootStore 通知 App 揭开工作台
 *  · 3 秒安全阀：任何数据源异常卡死也不阻塞进入工作台
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { reloadAllStores } from '../stores/reload'
import { useSyncStore } from '../stores/useSyncStore'
import { useConflictStore } from '../stores/useConflictStore'
import { useSourceStore } from '../stores/useSourceStore'
import { defaultSources, duplicateSourceIds } from '../services/intelligence/providers/registry'
import { resolveAIProvider } from '../services/ai/ai-service'
import { initIntelAutoFetch } from '../services/intelligence/auto'
import { initAutoSync } from '../sync/auto'

/** 种子标记：避免 dev StrictMode 双跑导致重复播种 */
let sourcesSeeded = false

/** 情报源：修复历史重复（按 name 去重）+ 幂等播种默认源 */
async function seedSources(): Promise<void> {
  if (sourcesSeeded) return
  sourcesSeeded = true
  await useSourceStore.getState().load()
  const st = useSourceStore.getState()
  for (const id of duplicateSourceIds(st.items)) {
    await useSourceStore.getState().remove(id)
  }
  const names = new Set(useSourceStore.getState().items.map((s) => s.name))
  for (const s of defaultSources()) {
    if (!names.has(s.name)) {
      await useSourceStore.getState().add(s)
      names.add(s.name)
    }
  }
}

/** 启动就绪状态：App 据此决定显示启动屏还是工作台 */
interface BootState {
  ready: boolean
  markReady: () => void
}

export const useBootStore = create<BootState>((set) => ({
  ready: false,
  markReady: () => set({ ready: true }),
}))

export function Bootstrap() {
  useEffect(() => {
    initAutoSync()
    initIntelAutoFetch()
    void resolveAIProvider()
    const boot = Promise.allSettled([
      reloadAllStores(),
      useSyncStore.getState().load(),
      useConflictStore.getState().load(),
      seedSources(),
    ])
    // 安全阀：正常本地 IndexedDB 毫秒级完成；若被拖住，3 秒后强制放行
    const failsafe = new Promise<void>((resolve) => setTimeout(resolve, 3000))
    void Promise.race([boot, failsafe]).then(() => {
      useBootStore.getState().markReady()
    })
  }, [])

  return null
}
