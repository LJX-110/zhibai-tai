/**
 * 全量 store 重载 —— 同步/导入后刷新内存态
 */
import { useAIResourceStore } from './useAIStore'
import { useBodyMetricLogStore, useBodyMetricStore } from './useBodyStore'
import { useCollectionStore } from './useCollectionStore'
import { useConflictStore } from './useConflictStore'
import { useDivinationStore } from './useDivinationStore'
import { useBudgetStore, useFinanceStore, usePurchaseStore } from './useFinanceStore'
import { useHabitLogStore, useHabitStore } from './useHabitStore'
import { useIntelligenceStore } from './useIntelligenceStore'
import { useNoteStore } from './useNoteStore'
import { usePomodoroStore } from './usePomodoroStore'
import { useProjectStore } from './useProjectStore'
import { useSourceStore } from './useSourceStore'
import { useActivityStore, useFollowStore } from './useLifeStores'
import { useCourseCancellationStore, useCourseRescheduleStore, useCourseStore, useExamStore, useHomeworkStore } from './useStudyStore'
import { useTaskStore } from './useTaskStore'
import { useWaterStore } from './useWaterStore'
import { useCategoryStore } from './useCategoryStore'
import { useCultivationStore } from './useCultivationStore'
import { usePetStore } from './usePetStore'
import { hydrateSyncedSettings } from '../services/settings-sync'

/** 重新从 IndexedDB 载入全部领域 store */
export async function reloadAllStores(): Promise<void> {
  await Promise.allSettled([
    useTaskStore.getState().load(),
    useNoteStore.getState().load(),
    useCategoryStore.getState().load(),
    useHabitStore.getState().load(),
    useHabitLogStore.getState().load(),
    useBodyMetricStore.getState().load(),
    useBodyMetricLogStore.getState().load(),
    useWaterStore.getState().load(),
    usePomodoroStore.getState().load(),
    useCourseStore.getState().load(),
    useCourseCancellationStore.getState().load(),
    useCourseRescheduleStore.getState().load(),
    useHomeworkStore.getState().load(),
    useExamStore.getState().load(),
    useCollectionStore.getState().load(),
    useIntelligenceStore.getState().load(),
    useDivinationStore.getState().load(),
    useAIResourceStore.getState().load(),
    useFinanceStore.getState().load(),
    usePurchaseStore.getState().load(),
    useBudgetStore.getState().load(),
    useProjectStore.getState().load(),
    useSourceStore.getState().load(),
    useActivityStore.getState().load(),
    useFollowStore.getState().load(),
    // 冲突记录非业务表（不在 BUSINESS_TABLES），但同样是内存态：
    // 同步/导入后不重载的话，设置页要重启才能看到新产生的冲突
    useConflictStore.getState().load(),
    // 修行状态与桌宠状态都是业务表：同步/导入后不重载，界面会停在旧值
    useCultivationStore.getState().load(),
    usePetStore.getState().load(),
  ])
  // 偏好设置存在业务表里，同步/导入后同样要回灌，否则界面还停在旧值
  await hydrateSyncedSettings()
}
