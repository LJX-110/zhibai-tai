/**
 * 情报 Provider 抽象 —— 统一数据模型（源驱动）
 *
 * 每个 IntelligenceSource 是一个可配置的来源（GitHub / RSS / Web / 自定义 等）。
 * 新增来源只需在「系统 · 情报源」配置，不改 UI 与页面代码。
 */
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'

export interface IntelligenceProvider {
  id: string
  name: string
  /** 拉取该源（Provider 自管过滤/去重/错误） */
  fetch: (source: IntelligenceSource, signal?: AbortSignal) => Promise<IntelligenceItem[]>
}

/**
 * 解析源的自定义配置（`source.config` 存 JSON 字符串）。
 * 配置写坏时回落到空对象，不因一条源的配置错误拖垮整次抓取。
 */
export function cfgOf<T = Record<string, unknown>>(source: IntelligenceSource): T {
  if (!source.config) return {} as T
  try {
    return JSON.parse(source.config) as T
  } catch {
    return {} as T
  }
}

/** 情报分类（供筛选） */
export const INTELLIGENCE_CATEGORIES = [
  '全部',
  'AI',
  '开发',
  'GitHub',
  '开源',
  '模型',
  '科技',
  '游戏',
  '动漫',
  '影视',
  '设计',
  '学习',
  '自定义',
]
