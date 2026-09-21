/**
 * 藏 · 插件 —— 项目与收藏明细 + 项目摘要
 *
 * 一块两块都在"藏"下（项目中心与收藏同属该板块），顺序沿用改造前：项目 → 收藏。
 */
import { NotebookPen } from 'lucide-react'
import { aiService } from '../../../services/ai/ai-service'
import { useProjectStore } from '../../../stores/useProjectStore'
import { useCollectionStore } from '../../../stores/useCollectionStore'
import type { TianjiPlugin } from './index'

export const collectionPlugin: TianjiPlugin = {
  id: 'collection',

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
          body: '还没有项目。去「藏 · 项目中心」新建一个项目，天机会为你生成摘要。',
        }
      }
      return { title: '项目摘要', body: await aiService.projectSummary(p) }
    },
  },
}
