/**
 * 藏 · 插件 —— 项目与收藏明细 + 项目摘要
 *
 * 一块两块都在"藏"下（项目中心与收藏同属该板块），顺序沿用改造前：项目 → 收藏。
 */
import { NotebookPen } from 'lucide-react'
import { aiService } from '../../../services/ai/ai-service'
import { useProjectStore } from '../../../stores/useProjectStore'
import { useCollectionStore } from '../../../stores/useCollectionStore'
import { defineTool } from '../../../services/agent/tools'
import type { TianjiPlugin } from './index'

export const collectionPlugin: TianjiPlugin = {
  id: 'collection',

  /** 工具：检索收藏 / 列出项目（都是只读，模型可自行调用） */
  tools: [
    defineTool({
      id: 'collection.search',
      name: '搜收藏',
      description: '按关键词在收藏（书名 / 标签 / 分类）里检索，返回标题、类型与状态。问"我是不是收过某个…"时用它。',
      inputSchema: { query: '关键词（可留空 = 最近 10 条）' },
      mode: 'read',
      riskLevel: 'search',
      execute: async (args) => {
        const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
        const all = useCollectionStore.getState().items
        const hit = all
          .filter(
            (c) =>
              !q ||
              c.title.toLowerCase().includes(q) ||
              (c.category ?? '').toLowerCase().includes(q) ||
              c.tags.some((t) => t.toLowerCase().includes(q)),
          )
          .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
        if (hit.length === 0) return { count: 0, text: '没有匹配的收藏。' }
        const rows = hit.slice(0, 10).map((c) => `- ${c.title}（${c.type}${c.category ? ` · ${c.category}` : ''}${c.status ? ` · ${c.status}` : ''}）`)
        return { count: hit.length, text: `命中 ${hit.length} 项，前 ${rows.length} 条：\n${rows.join('\n')}` }
      },
    }),
    defineTool({
      id: 'projects.list',
      name: '列项目',
      description: '列出项目中心的项目（状态 / 进度 / 下一步）。问"我手上有什么项目 / 某个项目到哪了"时用它。',
      inputSchema: { query: '关键词（可留空 = 全部，最多 10 个）' },
      mode: 'read',
      riskLevel: 'read',
      execute: async (args) => {
        const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
        const hit = useProjectStore
          .getState()
          .items.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
        if (hit.length === 0) return { count: 0, text: '没有匹配的项目。' }
        const rows = hit.slice(0, 10).map((p) => {
          const ms = p.milestones.filter((m) => m.done).length
          const next = p.nextStep ? ` · 下一步：${p.nextStep}` : ''
          return `- ${p.name}（${p.status} ${p.progress}%，里程碑 ${ms}/${p.milestones.length}）${next}`
        })
        return { count: hit.length, text: `共 ${hit.length} 个，前 ${rows.length} 个：\n${rows.join('\n')}` }
      },
    }),
  ],

  detail: (q) => {
    const projects = useProjectStore.getState().items
    const collections = useCollectionStore.getState().items
    const lines: string[] = []

    if (/项目|里程碑|进度|开发/.test(q)) {
      if (projects.length > 0) {
        lines.push(`【项目 · 共 ${projects.length} 个】`)
        for (const p of projects.slice(0, 8)) {
          const ms = p.milestones.filter((m) => m.done).length
          const next = p.nextStep ? ` · 下一步：${p.nextStep}` : ''
          lines.push(`  ${p.name}（${p.status} ${p.progress}%，里程碑 ${ms}/${p.milestones.length}）${next}`)
        }
      } else {
        lines.push('【项目】还没有项目')
      }
    }

    if (/收藏|藏品|动漫|小说|游戏|影视|书|在看|追/.test(q)) {
      if (collections.length > 0) {
        const byType = new Map<string, number>()
        for (const c of collections) byType.set(c.type, (byType.get(c.type) ?? 0) + 1)
        lines.push(
          `【收藏 · 共 ${collections.length} 项】${[...byType.entries()].map(([t, n]) => `${t} ${n}`).join(' · ')}`,
        )
        const latest = collections
          .slice()
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          .slice(0, 6)
        lines.push(`  最近：${latest.map((c) => `${c.title}${c.status ? `（${c.status}）` : ''}`).join('、')}`)
      } else {
        lines.push('【收藏】还没有收藏内容')
      }
    }

    return lines
  },

  capability: {
    key: 'project',
    label: '项目摘要',
    icon: NotebookPen,
    run: async () => {
      const p = useProjectStore.getState().items[0]
      if (!p) {
        return {
          title: '项目摘要',
          body: '还没有项目。在「藏 · 项目中心」新建后可生成摘要。',
        }
      }
      return { title: '项目摘要', body: await aiService.projectSummary(p) }
    },
  },
}
