/**
 * 情报 Provider 抽象 —— 统一数据模型（源驱动）
 *
 * 每个 IntelligenceSource 是一个可配置的来源（GitHub / RSS / Mock / 游戏 / 动漫 / 官方 / Web / Custom）。
 * 新增来源只需在「系统 · 情报源」配置，不改 UI 与页面代码。
 */
import type { IntelligenceItem, IntelligenceSource, SourceType } from '../../../types/entities'

export interface IntelligenceProvider {
  id: string
  name: string
  /** 拉取该源（Provider 自管过滤/去重/错误） */
  fetch: (source: IntelligenceSource, signal?: AbortSignal) => Promise<IntelligenceItem[]>
}

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  github: 'GitHub',
  rss: 'RSS',
  official: '官方',
  web: 'Web',
  game: '游戏',
  anime: '动漫',
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
