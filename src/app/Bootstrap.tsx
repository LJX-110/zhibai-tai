/**
 * 启动引导 —— 挂载时加载全部领域数据到 store，并向 App 汇报"就绪"
 *
 * 此前加载是"发射后不管"，页面在数据到达前就渲染，
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
import { defaultSources, duplicateSourceIds, migrateBilibiliSources, reviveDisabledDefaults } from '../services/intelligence/providers/registry'
import { resolveAIProvider } from '../services/ai/ai-service'
import { initIntelAutoFetch } from '../services/intelligence/auto'
import { useAIResourceStore } from '../stores/useAIStore'
import { captureInstallPrompt } from '../components/pwa/install'
import { AI_TYPE_LEGACY_LABEL, type AIResourceType } from '../types/entities'
import { initAutoSync } from '../sync/auto'
import { initSyncedSettings } from '../services/settings-sync'
import { seedAllCategories } from '../stores/useCategoryStore'
import { useCollectionStore } from '../stores/useCollectionStore'
import { COLLECTION_MEDIUM_LEGACY_LABEL } from '../services/categories'

/** 种子标记：避免 dev StrictMode 双跑导致重复播种 */
let sourcesSeeded = false

/**
 * 术类型数据化迁移：资源里的旧枚举键（model/tool/...）改写为类型名（模型/Tool/...）。
 * 类型本体已由 seedCategories('ai_type') 播种为业务行；幂等 —— 数据化之后登记的
 * 资源不含旧键，自然跳过。
 */
async function migrateAiResourceTypes(): Promise<void> {
  const st = useAIResourceStore.getState()
  if (!st.loaded) await st.load()
  for (const r of useAIResourceStore.getState().items) {
    const label = AI_TYPE_LEGACY_LABEL[r.type as AIResourceType]
    if (label) {
      await useAIResourceStore.getState().update(r.id, { type: label })
    }
  }
}

/**
 * 藏 · 介质数据化迁移：藏品的旧枚举键（novel/anime/...）改写为介质名（小说/动漫/...）。
 * 介质本体已由 seedCategories('collection_medium') 播种为业务行；幂等 ——
 * 数据化之后新建的藏品存的就是介质名，自然跳过。
 *
 * ⚠️ 不做这步的话：旧藏品会在下拉里显示成空白（枚举键不在介质清单里），
 * 一旦保存还会把原值改成别的介质 —— 静默改坏用户数据，比报错严重得多。
 */
async function migrateCollectionMediums(): Promise<void> {
  const st = useCollectionStore.getState()
  if (!st.loaded) await st.load()
  for (const it of useCollectionStore.getState().items) {
    const label = COLLECTION_MEDIUM_LEGACY_LABEL[it.type as keyof typeof COLLECTION_MEDIUM_LEGACY_LABEL]
    if (label) {
      await useCollectionStore.getState().update(it.id, { type: label })
    }
  }
}

/** 启动屏最短展示时长（与 index.html 里 .boot-fill 的动画时长保持一致）。
 *  本地 IndexedDB 是毫秒级就绪，若就绪即揭开，启动动画会一闪而过 ——
 *  用户反馈过「加载动画不明显、一闪而过」。 */
const MIN_BOOT_MS = 900

/** 情报源：修复历史重复（按 name 去重）+ 幂等播种默认源 + 补启用历史停用的默认源 */
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
  const { revived, removed } = await reviveDisabledDefaults(useSourceStore.getState().items)
  if (revived.length > 0) await useSourceStore.getState().load()
  // 已下线的默认源（机器之心）：remove 走墓碑，删除会随同步传播到其他设备
  for (const id of removed) {
    await useSourceStore.getState().remove(id)
  }
  if (removed.length > 0) await useSourceStore.getState().load()
  // B 站源改写：老的 rsshub.app 地址国内必然拉不到，就地换成本地签名 provider
  const migrated = await migrateBilibiliSources(useSourceStore.getState().items)
  if (migrated.length > 0) await useSourceStore.getState().load()
}

/** 启动就绪状态：App 据此决定显示启动屏还是工作台；
 *  `step` 是启动屏上那行阶段文案（"读取本地数据"之类）。
 *  进度条宽度由 CSS 时间动画推进，所以这里**不再维护步骤计数** ——
 *  算了没人看，反而多一份需要同步的状态。 */
interface BootState {
  ready: boolean
  step: string
  setStep: (label: string) => void
  markReady: () => void
}

export const useBootStore = create<BootState>((set) => ({
  ready: false,
  step: '正在铺开文房',
  setStep: (label) => set({ step: label }),
  markReady: () => set({ ready: true }),
}))

export function Bootstrap() {
  useEffect(() => {
    initAutoSync()
    initSyncedSettings()
    initIntelAutoFetch()
    // PWA 安装时机只触发一次，必须由模块级捕获保管、供多处读取
    captureInstallPrompt()
    void resolveAIProvider()
    // 步骤表只供启动屏那行阶段文案使用；执行仍并行，
    // 谁先完成谁先报，不把毫秒级的本地读取串行化
    const steps: [string, () => Promise<unknown>][] = [
      ['读取本地数据', () => reloadAllStores()],
      ['载入同步状态', () => useSyncStore.getState().load()],
      ['载入冲突记录', () => useConflictStore.getState().load()],
      ['整理情报源', seedSources],
      ['整理分类', () => seedAllCategories()],
      ['迁移术类型', migrateAiResourceTypes],
      ['迁移藏品介质', migrateCollectionMediums],
    ]
    const boot = Promise.allSettled(
      steps.map(async ([label, run]) => {
        try {
          await run()
        } finally {
          useBootStore.getState().setStep(label)
        }
      }),
    )
    // 安全阀：正常本地 IndexedDB 毫秒级完成；若被拖住，3 秒后强制放行
    const failsafe = new Promise<void>((resolve) => setTimeout(resolve, 3000))
    const startedAt = performance.now()
    void Promise.race([boot, failsafe]).then(async () => {
      // 补足最短展示时长：数据快时让「正在加载」可感知；数据确实慢时自然超过，不额外拖延
      const elapsed = performance.now() - startedAt
      if (elapsed < MIN_BOOT_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_BOOT_MS - elapsed))
      }
      useBootStore.getState().markReady()
    })
  }, [])

  return null
}
