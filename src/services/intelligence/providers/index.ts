/**
 * 情报 Provider 抽象 —— 统一数据模型（源驱动）
 *
 * 每个 IntelligenceSource 是一个可配置的来源（GitHub / RSS / Web / 自定义 等）。
 * 新增来源只需在「系统 · 数据 · 抓取与代理」配置，不改 UI 与页面代码。
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
 * 没写 → 空对象；**写了但不是合法 JSON → 报 config 错**。
 * 静默回落会让来源带着默认参数空跑，用户只看到「成功但 0 条」，问题被藏起来。
 */
export function cfgOf<T = Record<string, unknown>>(source: IntelligenceSource): T {
  if (!source.config) return {} as T
  try {
    return JSON.parse(source.config) as T
  } catch {
    throw new Error('config: 源配置不是合法 JSON（检查 config 字段）')
  }
}

/**
 * 上游日期 → ISO 字符串；解析不了返回 undefined。
 * RSS 的 pubDate、JSON 的 date 都不保证合法（"昨天"、空时区、"Q4 2024"…），
 * 直接 `toISOString()` 会抛 RangeError —— **一条坏数据就会让整个源失败**。
 */
export function toIsoDate(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined
  const d = new Date(raw as string | number)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
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
