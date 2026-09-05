/**
 * Mock Provider —— 离线示例
 */
import { createId } from '../../../utils/id'
import type { IntelligenceItem, IntelligenceSource } from '../../../types/entities'
import type { IntelligenceProvider } from './index'

export const mockProvider: IntelligenceProvider = {
  id: 'mock',
  name: '示例情报',
  fetch: async (_source: IntelligenceSource) => {
    const now = Date.now()
    const h = 3600_000
    const seeds: Omit<
      IntelligenceItem,
      'id' | 'createdAt' | 'favorite' | 'read' | 'sourceName'
    >[] = [
      {
        title: 'Tailwind CSS v4 主题机制正式落地',
        source: 'tailwindcss.com',
        sourceType: 'official',
        category: '开发',
        url: 'https://tailwindcss.com',
        summary: '基于 @theme 的 CSS-first 配置，配合 Vite 插件开箱即用。',
        publishedAt: new Date(now - 3 * h).toISOString(),
        tags: ['前端', 'tailwind'],
      },
      {
        title: 'Dexie 4.0 发布，IndexedDB 操作再提速',
        source: 'dexie.org',
        sourceType: 'official',
        category: '开发',
        url: 'https://dexie.org',
        summary: '改进事务性能与类型推导，离线优先应用的首选封装。',
        publishedAt: new Date(now - 8 * h).toISOString(),
        tags: ['存储', 'indexeddb'],
      },
      {
        title: 'Local-first 软件浪潮：数据主权回到用户手中',
        source: 'localhost',
        sourceType: 'web',
        category: '科技',
        url: 'https://example.com',
        summary: '离线可用、数据本地、可选择同步，正是本工作台的架构方向。',
        publishedAt: new Date(now - 3 * 24 * h).toISOString(),
        tags: ['local-first', '架构'],
      },
    ]

    await new Promise((r) => setTimeout(r, 120))
    return seeds.map((s) => ({
      ...s,
      id: createId(),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      favorite: false,
      read: false,
      convertedToNoteId: null,
      convertedToTaskId: null,
    }))
  },
}
