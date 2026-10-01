/**
 * 桌宠 · 恢复默认位置（Step 5-2C F 批 · 从 `usePetLoop` 抽出）
 *
 * ## 为什么单独成文件
 * `usePetLoop` 已经贴着 400 行上限（项目硬规则）。而"复位"这件事**不属于决策循环**：
 * 决策循环管的是"下一段播什么动画、往哪走"，复位管的是"外部命令来了，把位置摆回角落"。
 * 两者生命周期、触发源、依赖都不同，所以按职责切开，顺带给 usePetLoop 腾出余量。
 *
 * ## 语义（与 `placeInitial` 的关键区别）
 * `placeInitial` 在启动时**优先用本机存档**；本 hook **忽略存档**、强制用配置里的角落锚点。
 * 写回仍走 `PetHost.persistLocalPosition` —— **设备级、不进同步**。
 */
import { useCallback, type RefObject } from 'react'
import type { PetConfig } from '../services/pet/types'

export function usePetReset(
  cfgRef: RefObject<PetConfig | null>,
  sizeRef: RefObject<number>,
  resetPositionOf: (cfg: PetConfig, size: number) => void,
): () => void {
  return useCallback(() => {
    const cfg = cfgRef.current
    if (!cfg) return
    resetPositionOf(cfg, sizeRef.current)
  }, [resetPositionOf, cfgRef, sizeRef])
}
