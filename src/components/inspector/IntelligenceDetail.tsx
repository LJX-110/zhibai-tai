/**
 * Inspector · 情报详情：闭环操作
 * （AI 摘要 / 转灵感 / 转任务 / 转项目 / 关注 / 收藏 / 稍后 / 打开原文）
 */
import { ExternalLink, FolderPlus, ListPlus, Plus, Sparkles, Star, StickyNote, Trash2 } from 'lucide-react'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useNoteStore } from '../../stores/useNoteStore'
import { useAIResourceStore } from '../../stores/useAIStore'
import { useFollowStore } from '../../stores/useLifeStores'
import { localAIService } from '../../services/ai/ai-service'
import { recordActivity } from '../../services/activity'
import { useToast } from '../ui/toast-store'
import { Badge, Button } from '../ui'
import { createId, friendlyDate, nowISO } from '../../utils/id'
import { EmptyInspector, InspectorShell, MetaSection } from './shared'

export function IntelligenceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast().toast
  const intel = useIntelligenceStore((s) => s.items.find((x) => x.id === id))
  const follows = useFollowStore((s) => s.items)
  const aiRes = useAIResourceStore((s) => s.items)

  if (!intel) return <EmptyInspector onClose={onClose} />

  const markRead = (read: boolean) => useIntelligenceStore.getState().update(intel.id, { read })

  const summarize = async () => {
    if (intel.aiSummary) return toast('已有摘要')
    const summary = await localAIService.summarize(intel)
    await useIntelligenceStore.getState().update(intel.id, { aiSummary: summary })
    toast('摘要已生成（本地）', 'success')
  }

  const toNote = async () => {
    if (intel.convertedToNoteId) return toast('已转过灵感')
    const now = nowISO()
    const noteId = createId()
    await useNoteStore.getState().add({
      id: noteId,
      kind: 'inspiration',
      title: intel.title,
      body: intel.summary ?? '',
      tags: [...intel.tags, intel.source],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    })
    await useIntelligenceStore.getState().update(intel.id, { convertedToNoteId: noteId })
    void recordActivity({ entityType: 'intelligence', entityId: intel.id, title: `情报转灵感：${intel.title.slice(0, 26)}` })
    toast('已转为灵感 → 记事本', 'success')
  }

  const toTask = async () => {
    if (intel.convertedToTaskId) return toast('已转过任务')
    const now = nowISO()
    const taskId = createId()
    await useTaskStore.getState().add({
      id: taskId,
      title: intel.title,
      description: intel.summary ?? '',
      done: false,
      priority: 'mid',
      dueDate: null,
      tags: intel.tags,
      repeat: 'none',
      projectId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    await useIntelligenceStore.getState().update(intel.id, { convertedToTaskId: taskId })
    void recordActivity({ entityType: 'intelligence', entityId: intel.id, title: `情报转任务：${intel.title.slice(0, 26)}` })
    toast('已转为任务 → 行', 'success')
  }

  const toProject = async () => {
    if (intel.projectId) return toast('已关联项目')
    const now = nowISO()
    const projectId = createId()
    await useProjectStore.getState().add({
      id: projectId,
      name: intel.title.slice(0, 40),
      repo: intel.sourceType === 'github' ? intel.url : undefined,
      description: intel.summary,
      stack: intel.tags,
      status: 'planning',
      progress: 0,
      milestones: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
    })
    await useIntelligenceStore.getState().update(intel.id, { projectId })
    void recordActivity({ entityType: 'intelligence', entityId: intel.id, title: `情报建项目：${intel.title.slice(0, 26)}` })
    toast('已建立项目 → 藏', 'success')
  }

  const followItem = async () => {
    const keyword = (intel.source ?? intel.category ?? '').split(' ')[0] || intel.title.slice(0, 10)
    const exists = follows.some((f) => f.keyword.toLowerCase() === keyword.toLowerCase())
    if (exists) return toast('已关注该来源')
    await useFollowStore.getState().add({
      id: createId(),
      name: keyword,
      type: intel.sourceType === 'game' ? 'game' : intel.sourceType === 'anime' ? 'anime' : intel.sourceType === 'github' ? 'github' : 'topic',
      keyword,
      createdAt: nowISO(),
    })
    toast(`已关注「${keyword}」`, 'success')
  }

  return (
    <InspectorShell title="情报详情" onClose={onClose}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="display min-w-0 flex-1 text-lg font-semibold text-ink">{intel.title}</h3>
        {/* 情报此前没有任何删除入口：既不能删、又没有数量上限，只能越堆越多 */}
        <button
          onClick={async () => {
            await useIntelligenceStore.getState().remove(intel.id)
            onClose()
            toast('已删除该条情报')
          }}
          className="shrink-0 rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-cinnabar"
          aria-label="删除情报"
          title="删除这条情报"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {intel.summary && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{intel.summary}</p>}
      {intel.aiSummary && (
        <div className="mt-2 rounded-tile border border-bronze/30 bg-bronze/8 px-3 py-2 text-xs leading-relaxed text-bronze">
          AI 摘要：{intel.aiSummary}
        </div>
      )}
      <MetaSection>
        <Badge tone="teal">{intel.source}</Badge>
        {intel.category && <Badge tone="plain">{intel.category}</Badge>}
        {intel.publishedAt && <Badge tone="plain">{friendlyDate(intel.publishedAt.slice(0, 10))}</Badge>}
      </MetaSection>
      {intel.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {intel.tags?.slice(0, 6).map((t) => <span key={t} className="text-xs text-ink-faint">#{t}</span>)}
        </div>
      )}
      {intel.url && (
        <a href={intel.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-teal link-underline">
          <ExternalLink size={14} /> 打开原文
        </a>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 eyebrow text-ink-faint">闭环 · CLOSED LOOP</div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={summarize}>
            <Sparkles size={13} /> {intel.aiSummary ? '已有摘要' : 'AI 摘要'}
          </Button>
          <Button size="sm" variant="secondary" onClick={toNote}>
            <StickyNote size={13} /> {intel.convertedToNoteId ? '已转灵感' : '转灵感'}
          </Button>
          <Button size="sm" variant="secondary" onClick={toTask}>
            <ListPlus size={13} /> {intel.convertedToTaskId ? '已转任务' : '转任务'}
          </Button>
          <Button size="sm" variant="secondary" onClick={toProject}>
            <FolderPlus size={13} /> {intel.projectId ? '已建项目' : '建项目'}
          </Button>
          <Button size="sm" variant="secondary" onClick={followItem}>
            <Plus size={13} /> 关注
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await useIntelligenceStore.getState().update(intel.id, { favorite: !intel.favorite })
            }}
          >
            <Star size={13} fill={intel.favorite ? 'currentColor' : 'none'} /> {intel.favorite ? '已收藏' : '收藏'}
          </Button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="tertiary" onClick={() => markRead(!intel.read)}>
            {intel.read ? '标为未读（稍后）' : '标为已读'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          {aiRes.length > 0 ? `已登记 ${aiRes.length} 项 AI 能力，可用于扩展摘要/标签。` : '摘要由本地 AI 服务生成（可接入远程 Provider）。'}
        </p>
      </div>
    </InspectorShell>
  )
}
