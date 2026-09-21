/**
 * 情 · 插件 —— 情报的总结能力
 *
 * 基础概览里已有"情报 N 条（未读 M）"一条；这里提供一键"总结情报"（最新一条的
 * 摘要 + 标签 + 重要度）。
 */
import { FileText } from 'lucide-react'
import { aiService } from '../../../services/ai/ai-service'
import { useIntelligenceStore } from '../../../stores/useIntelligenceStore'
import type { TianjiPlugin } from './index'

export const intelligencePlugin: TianjiPlugin = {
  id: 'intelligence',

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
