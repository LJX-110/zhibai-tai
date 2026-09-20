/**
 * 命令面板 · 全局搜索
 * 纯逻辑（读各 store 的当前快照），不依赖 React 状态，便于单测与复用。
 */
import type { SectionId } from '../../../app/navigation'
import type { InspectorType } from '../../inspector/Inspector'
import { useTaskStore } from '../../../stores/useTaskStore'
import { useNoteStore } from '../../../stores/useNoteStore'
import { useCollectionStore } from '../../../stores/useCollectionStore'
import { useProjectStore } from '../../../stores/useProjectStore'
import { useIntelligenceStore } from '../../../stores/useIntelligenceStore'
import { useCourseStore } from '../../../stores/useStudyStore'
import { useFinanceStore } from '../../../stores/useFinanceStore'

export interface SearchResult {
  id: string
  group: string
  title: string
  sub?: string
  section: SectionId
  /** 支持直达详情的条目带实体 id 与 Inspector 类型（笔记暂无详情面板，仅跳板块） */
  entityId?: string
  inspector?: InspectorType
}

export function searchAll(query: string): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches = (s: string) => s.toLowerCase().includes(q)
  const out: SearchResult[] = []
  const push = (
    g: string,
    section: SectionId,
    items: { id: string; title: string; sub?: string; inspector?: SearchResult['inspector'] }[],
  ) => {
    for (const it of items) {
      if (matches(it.title) || matches(it.sub ?? '')) {
        out.push({ id: `${g}-${it.id}`, group: g, title: it.title, sub: it.sub, section, entityId: it.id, inspector: it.inspector })
      }
    }
  }

  push('任务', 'action', useTaskStore.getState().items.map((t) => ({ id: t.id, title: t.title, sub: t.done ? '已完成' : '未完成', inspector: 'task' as const })))
  push('笔记', 'action', useNoteStore.getState().items.map((n) => ({ id: n.id, title: n.title || '（无题）', sub: n.kind === 'inspiration' ? '灵感' : '笔记' })))
  push('收藏', 'collection', useCollectionStore.getState().items.map((c) => ({ id: c.id, title: c.title, sub: c.category, inspector: 'collection' as const })))
  push('项目', 'collection', useProjectStore.getState().items.map((p) => ({ id: p.id, title: p.name, sub: p.status, inspector: 'project' as const })))
  push('情报', 'intelligence', useIntelligenceStore.getState().items.map((i) => ({ id: i.id, title: i.title, sub: i.source, inspector: 'intelligence' as const })))
  push('课程', 'study', useCourseStore.getState().items.map((c) => ({ id: c.id, title: c.name, sub: c.teacher, inspector: 'course' as const })))
  push('消费', 'finance', useFinanceStore.getState().items.map((f) => ({ id: f.id, title: f.merchant || f.note || '流水', sub: `${f.kind === 'income' ? '+' : '-'}${f.amount}`, inspector: 'finance' as const })))

  return out.slice(0, 30)
}
