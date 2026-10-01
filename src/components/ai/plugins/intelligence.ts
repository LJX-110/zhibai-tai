/**
 * 情 · 插件 —— 情报的总结能力
 *
 * 基础概览里已有"情报 N 条（未读 M）"一条；这里提供一键"总结情报"（最新一条的
 * 摘要 + 标签 + 重要度）。
 */
import { FileText } from 'lucide-react'
import { aiService } from '../../../services/ai/ai-service'
import { useIntelligenceStore } from '../../../stores/useIntelligenceStore'
import { defineTool } from '../../../services/agent/tools'
import type { TianjiPlugin } from './index'

export const intelligencePlugin: TianjiPlugin = {
  id: 'intelligence',

  /** 工具：看最近情报（只读）—— "最近在关注什么"这类问题走它，而不是靠注入整份流 */
  tools: [
    defineTool({
      id: 'intelligence.recent',
      name: '看最近情报',
      description: '列出最近的情报标题（可按关键词过滤，默认取未读优先）。问"最近有什么新情报 / 有没有关于某个话题的"时用它。',
      inputSchema: { query: '关键词（可留空）', limit: '条数（可选，默认 8，最多 15）' },
      mode: 'read',
      riskLevel: 'read',
      execute: async (args) => {
        const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
        const rawLimit = typeof args.limit === 'number' ? args.limit : 8
        const limit = Math.max(1, Math.min(15, Math.round(rawLimit)))
        const all = useIntelligenceStore.getState().items
        const hit = all
          .filter(
            (it) =>
              !q ||
              it.title.toLowerCase().includes(q) ||
              (it.category ?? '').toLowerCase().includes(q) ||
              it.tags.some((t) => t.toLowerCase().includes(q)),
          )
          .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
        if (hit.length === 0) return { count: 0, text: '没有匹配的情报。' }
        const unread = hit.filter((it) => !it.read).length
        const rows = hit.slice(0, limit).map((it) => {
          const when = (it.publishedAt ?? it.createdAt).slice(0, 10)
          return `- ${it.title}（${it.source ?? '未标来源'} · ${when}${it.read ? '' : ' · 未读'}）`
        })
        return {
          count: hit.length,
          text: `命中 ${hit.length} 条（未读 ${unread}），前 ${rows.length} 条：\n${rows.join('\n')}`,
        }
      },
    }),
  ],

  capability: {
    key: 'intel',
    label: '总结情报',
    icon: FileText,
    run: async () => {
      const intel = useIntelligenceStore.getState().items
      const it = [...intel].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      if (!it) {
        return {
          title: '情报摘要',
          body: '还没有情报。去「情」拉取一些情报后，天机会为最新一条生成摘要与标签。',
        }
      }
      const [summary, tags, rank] = await Promise.all([
        aiService.summarize(it),
        aiService.tag(it),
        aiService.rank(it),
      ])
      return {
        title: '情报摘要',
        body: `标题：${it.title}\n摘要：${summary}\n标签：${tags.join('、')}\n重要度：${rank}`,
      }
    },
  },
}
