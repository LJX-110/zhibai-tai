/**
 * Inspector —— 右侧详情面板（桌面）/ 底部 Sheet（移动）
 * 支持：任务 / 收藏 / 项目 / 情报 / 课程 / 消费 / AI 资产 / 奇门记录
 * 结构：标题 → 状态 → 核心信息 → 关联 → 操作（不重复整个页面）
 */
import { create } from 'zustand'
import { ExternalLink, FolderPlus, ListPlus, Plus, Sparkles, Star, StickyNote, Trash2, X } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import { useTaskStore } from '../../stores/useTaskStore'
import { useCollectionStore } from '../../stores/useCollectionStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { useAIResourceStore } from '../../stores/useAIStore'
import { useDivinationStore } from '../../stores/useDivinationStore'
import { useNoteStore } from '../../stores/useNoteStore'
import { useFollowStore } from '../../stores/useLifeStores'
import { localAIService } from '../../services/ai/ai-service'
import { toggleTaskCore } from '../../hooks/useTaskActions'
import { recordActivity } from '../../services/activity'
import { useToast } from '../ui/Toast'
import { Badge, Button } from '../ui'
import { createId, friendlyDate } from '../../utils/id'

export type InspectorType =
  | 'task'
  | 'collection'
  | 'project'
  | 'intelligence'
  | 'course'
  | 'finance'
  | 'ai'
  | 'divination'

interface InspectorState {
  type: InspectorType | null
  id: string | null
  open: (type: InspectorType, id: string) => void
  close: () => void
}

export const useInspectorStore = create<InspectorState>((set) => ({
  type: null,
  id: null,
  open: (type, id) => set({ type, id }),
  close: () => set({ type: null, id: null }),
}))

export function Inspector() {
  const { type, id, close } = useInspectorStore()
  const layout = useResolvedLayout()
  const isMobile = layout === 'mobile'

  if (!type || !id) return null

  const content = <InspectorBody type={type} id={id} onClose={close} />

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-ink/40" onClick={close} />
        <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-sheet bg-paper p-5 pb-safe shadow-overlay animate-[sheet-up_240ms_var(--ease-standard)]">
          {content}
        </div>
      </div>
    )
  }

  return (
    <aside className="fixed right-0 top-[var(--header-h)] bottom-0 z-30 w-[360px] overflow-y-auto border-l border-line bg-panel p-6 animate-[page-fade_160ms_var(--ease-standard)]">
      {content}
    </aside>
  )
}

function InspectorBody({ type, id, onClose }: { type: InspectorType; id: string; onClose: () => void }) {
  const toast = useToast().toast
  const setSection = useAppStore((s) => s.setSection)
  // 全部 hooks 无条件调用（避免条件调用规则）
  const task = useTaskStore((s) => s.items.find((t) => t.id === id))
  const item = useCollectionStore((s) => s.items.find((c) => c.id === id))
  const proj = useProjectStore((s) => s.items.find((x) => x.id === id))
  const intel = useIntelligenceStore((s) => s.items.find((x) => x.id === id))
  const course = useCourseStore((s) => s.items.find((c) => c.id === id))
  const finance = useFinanceStore((s) => s.items.find((f) => f.id === id))
  const aiRes = useAIResourceStore((s) => s.items.find((a) => a.id === id))
  const divRecord = useDivinationStore((s) => s.items.find((d) => d.id === id))
  const project = useProjectStore((s) => s.items.find((p) => p.id === task?.projectId))
  const courseLink = useCourseStore((s) => s.items.find((c) => c.id === task?.courseId))
  // 项目聚合：按 projectId 关联 任务 / 笔记 / 情报
  const allTasks = useTaskStore((s) => s.items)
  const allNotes = useNoteStore((s) => s.items)
  const projTasks = allTasks.filter((t) => t.projectId === id)
  const projNotes = allNotes.filter((n) => n.projectId === id)
  // zustand v5 走 useSyncExternalStore：selector 必须返回稳定引用，
  // 在 selector 里 .filter() 会每次生成新数组 → 无限重渲染（React #185）
  const allIntel = useIntelligenceStore((s) => s.items)
  const projIntel = allIntel.filter((x) => x.projectId === id)

  if (type === 'task' && task) {
    return (
      <InspectorShell title="任务详情" onClose={onClose}>
        <h3 className="display text-lg font-semibold text-ink">{task.title}</h3>
        {task.description && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{task.description}</p>}
        <MetaSection>
          <Badge tone={task.priority === 'high' ? 'cinnabar' : task.priority === 'mid' ? 'bronze' : 'plain'}>
            {task.priority === 'high' ? '急' : task.priority === 'mid' ? '中' : '缓'}
          </Badge>
          {task.dueDate && <Badge tone="plain">{friendlyDate(task.dueDate)}</Badge>}
          {project && <Badge tone="teal">项目 · {project.name}</Badge>}
          {courseLink && <Badge tone="cinnabar">课程 · {courseLink.name}</Badge>}
        </MetaSection>
        <ActionSection>
          <Button
            variant={task.done ? 'secondary' : 'primary'}
            onClick={async () => {
              // 与待办列表共用同一完成核心：重复任务完成时同样生成下一次
              const { done, createdNext } = await toggleTaskCore(task)
              toast(
                done ? (createdNext ? '完成待办 · 已生成下一次' : '完成待办 · 道行有进') : '已标记未完成',
                done ? 'success' : undefined,
              )
            }}
          >
            {task.done ? '标记未完成' : '标记完成'}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await useTaskStore.getState().remove(task.id)
              onClose()
              toast('已删除')
            }}
          >
            <Trash2 size={14} /> 删除
          </Button>
        </ActionSection>
      </InspectorShell>
    )
  }

  if (type === 'collection' && item) {
    return (
      <InspectorShell title="藏品详情" onClose={onClose}>
        <h3 className="display text-lg font-semibold text-ink">{item.title}</h3>
        {item.description && <p className="mt-2 text-sm text-ink-soft">{item.description}</p>}
        <MetaSection>
          <Badge tone="plain">{item.type}</Badge>
          {item.status && <Badge>{item.status}</Badge>}
          {item.rating != null && <Badge tone="bronze">{'★'.repeat(item.rating)}</Badge>}
        </MetaSection>
        {item.notes && <p className="mt-3 whitespace-pre-wrap text-xs text-ink-muted">{item.notes}</p>}
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-teal link-underline">
            <ExternalLink size={14} /> 打开链接
          </a>
        )}
      </InspectorShell>
    )
  }

  if (type === 'project' && proj) {
    return (
      <InspectorShell title="项目详情" onClose={onClose}>
        <div className="flex items-center gap-2">
          <h3 className="display text-lg font-semibold text-ink">{proj.name}</h3>
          <Badge tone={proj.status === 'done' ? 'bronze' : proj.status === 'developing' ? 'cinnabar' : 'plain'}>
            {proj.status}
          </Badge>
        </div>
        {proj.description && <p className="mt-2 text-sm text-ink-soft">{proj.description}</p>}
        {proj.stack?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {proj.stack?.slice(0, 6).map((t) => <span key={t} className="text-xs text-ink-faint">#{t}</span>)}
          </div>
        )}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span>进度</span><span className="tabular">{proj.progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-nested">
            <div className="h-full rounded-full bg-cinnabar" style={{ width: `${proj.progress}%` }} />
          </div>
        </div>
        {proj.nextStep && <p className="mt-3 text-xs text-ink-muted">下一步：{proj.nextStep}</p>}
        {proj.repo && (
          <a href={proj.repo.startsWith('http') ? proj.repo : `https://github.com/${proj.repo}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-teal link-underline">
            <ExternalLink size={14} /> {proj.repo}
          </a>
        )}
        {/* 项目档案聚合：任务 / 笔记 / 情报 */}
        {(projTasks.length > 0 || projNotes.length > 0 || projIntel.length > 0) && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 text-[11px] tracking-[0.2em] text-ink-faint">项目档案 · ARCHIVE</div>
            {projTasks.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 text-xs text-ink-muted">任务 {projTasks.length}</div>
                <div className="space-y-0.5">
                  {projTasks.slice(0, 4).map((t) => (
                    <button key={t.id} onClick={() => useInspectorStore.getState().open('task', t.id)} className="block w-full truncate text-left text-xs text-ink hover:text-cinnabar">
                      {t.done ? '✓ ' : '· '}{t.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {projNotes.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 text-xs text-ink-muted">笔记 {projNotes.length}</div>
                <div className="space-y-0.5">
                  {projNotes.slice(0, 4).map((n) => (
                    <div key={n.id} className="truncate text-xs text-ink-soft">· {n.title || '（无题）'}</div>
                  ))}
                </div>
              </div>
            )}
            {projIntel.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-ink-muted">情报 {projIntel.length}</div>
                <div className="space-y-0.5">
                  {projIntel.slice(0, 4).map((x) => (
                    <button key={x.id} onClick={() => useInspectorStore.getState().open('intelligence', x.id)} className="block w-full truncate text-left text-xs text-ink hover:text-cinnabar">
                      · {x.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <ActionSection>
          <Button variant="secondary" onClick={() => { setSection('collection'); onClose() }}>前往项目中心</Button>
        </ActionSection>
      </InspectorShell>
    )
  }

  if (type === 'intelligence' && intel) {
    return <IntelligenceDetail intel={intel} onClose={onClose} />
  }

  if (type === 'course' && course) {
    return (
      <InspectorShell title="课程详情" onClose={onClose}>
        <h3 className="display text-lg font-semibold text-ink">{course.name}</h3>
        <MetaSection>
          <Badge tone="teal">{course.credit} 学分</Badge>
          {course.teacher && <Badge tone="plain">师 · {course.teacher}</Badge>}
          {course.room && <Badge tone="plain">室 · {course.room}</Badge>}
        </MetaSection>
        {course.schedule?.length > 0 && (
          <div className="mt-3 space-y-1">
            {course.schedule?.map((s, i) => (
              <div key={i} className="text-xs text-ink-muted">
                周{['日', '一', '二', '三', '四', '五', '六'][s.weekday]} {s.start}–{s.end}
              </div>
            ))}
          </div>
        )}
        {course.note && <p className="mt-3 text-xs text-ink-muted">{course.note}</p>}
      </InspectorShell>
    )
  }

  if (type === 'finance' && finance) {
    return (
      <InspectorShell title="消费详情" onClose={onClose}>
        <h3 className="display text-lg font-semibold text-ink">
          {finance.merchant || finance.note || '流水'}
        </h3>
        <MetaSection>
          <Badge tone={finance.kind === 'income' ? 'teal' : 'cinnabar'}>
            {finance.kind === 'income' ? '收入' : '支出'}
          </Badge>
          <Badge tone="plain">{finance.category}</Badge>
          {finance.isPurchase && <Badge tone="bronze">购买</Badge>}
        </MetaSection>
        <div className="mt-3 text-3xl font-semibold tabular text-ink-bright">
          {finance.kind === 'income' ? '+' : '-'}{finance.amount.toFixed(2)}
        </div>
        <div className="mt-1 text-xs text-ink-faint">{finance.date}</div>
        {finance.note && <p className="mt-2 text-xs text-ink-muted">{finance.note}</p>}
      </InspectorShell>
    )
  }

  if (type === 'ai' && aiRes) {
    return (
      <InspectorShell title="AI 能力详情" onClose={onClose}>
        <h3 className="display text-lg font-semibold text-ink">{aiRes.name}</h3>
        <MetaSection>
          <Badge tone="teal">{aiRes.type}</Badge>
          {aiRes.provider && <Badge tone="plain">{aiRes.provider}</Badge>}
          <Badge tone={aiRes.enabled ? 'bronze' : 'plain'}>{aiRes.enabled ? '启用' : '停用'}</Badge>
        </MetaSection>
        {aiRes.description && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{aiRes.description}</p>}
        {aiRes.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {aiRes.tags?.map((t) => <span key={t} className="text-xs text-ink-faint">#{t}</span>)}
          </div>
        )}
        {aiRes.config && (
          <pre className="mt-3 overflow-x-auto rounded-tile bg-nested/50 p-3 font-mono text-xs text-ink-muted">
            {aiRes.config}
          </pre>
        )}
        <ActionSection>
          <Button
            variant={aiRes.enabled ? 'secondary' : 'primary'}
            onClick={async () => {
              await useAIResourceStore.getState().update(aiRes.id, {
                enabled: !aiRes.enabled,
                updatedAt: new Date().toISOString(),
              })
            }}
          >
            {aiRes.enabled ? '停用' : '启用'}
          </Button>
        </ActionSection>
      </InspectorShell>
    )
  }

  if (type === 'divination' && divRecord) {
    return (
      <InspectorShell title="占卜详情" onClose={onClose}>
        <h3 className="display text-lg font-semibold text-ink">{divRecord.title}</h3>
        <MetaSection>
          <Badge tone={divRecord.type === 'hexagram' ? 'cinnabar' : divRecord.type === 'qimen' ? 'bronze' : 'plain'}>
            {divRecord.type === 'daily_sign' ? '每日签' : divRecord.type === 'hexagram' ? '六爻' : divRecord.type === 'qimen' ? '奇门' : divRecord.type}
          </Badge>
          <Badge tone="plain">{divRecord.date}</Badge>
        </MetaSection>
        {divRecord.interpretation && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{divRecord.interpretation}</p>}
        {divRecord.detail && (
          <pre className="mt-3 whitespace-pre-wrap rounded-tile bg-nested/50 p-3 font-mono text-xs text-ink-muted">
            {divRecord.detail}
          </pre>
        )}
        {divRecord.input && <p className="mt-3 text-xs text-ink-faint">起盘：{divRecord.input}</p>}
        {divRecord.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {divRecord.tags?.map((t) => <span key={t} className="text-xs text-ink-faint">#{t}</span>)}
          </div>
        )}
      </InspectorShell>
    )
  }

  return <EmptyInspector onClose={onClose} />
}

/** 情报详情：闭环操作（AI摘要 / 转灵感 / 转任务 / 转项目 / 关注 / 收藏 / 稍后 / 打开） */
function IntelligenceDetail({ intel, onClose }: { intel: ReturnType<typeof useIntelligenceStore.getState>['items'][number]; onClose: () => void }) {
  const toast = useToast().toast
  const follows = useFollowStore((s) => s.items)
  const aiRes = useAIResourceStore((s) => s.items)

  const markRead = (read: boolean) => useIntelligenceStore.getState().update(intel.id, { read })

  const summarize = async () => {
    if (intel.aiSummary) return toast('已有摘要')
    const summary = await localAIService.summarize(intel)
    await useIntelligenceStore.getState().update(intel.id, { aiSummary: summary })
    toast('摘要已生成（本地）', 'success')
  }

  const toNote = async () => {
    if (intel.convertedToNoteId) return toast('已转过灵感')
    const now = new Date().toISOString()
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
    const now = new Date().toISOString()
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
    const now = new Date().toISOString()
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
      createdAt: new Date().toISOString(),
    })
    toast(`已关注「${keyword}」`, 'success')
  }

  return (
    <InspectorShell title="情报详情" onClose={onClose}>
      <h3 className="display text-lg font-semibold text-ink">{intel.title}</h3>
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
        <div className="mb-2 text-[11px] tracking-[0.2em] text-ink-faint">闭环 · CLOSED LOOP</div>
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
        <p className="mt-3 text-[11px] text-ink-faint">
          {aiRes.length > 0 ? `已登记 ${aiRes.length} 项 AI 能力，可用于扩展摘要/标签。` : '摘要由本地 AI 服务生成（可接入远程 Provider）。'}
        </p>
      </div>
    </InspectorShell>
  )
}

function InspectorShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] tracking-[0.25em] text-ink-faint">{title}</span>
        <button onClick={onClose} className="touch-target flex items-center justify-center rounded-control p-1 text-ink-muted hover:bg-raised hover:text-ink" aria-label="关闭">
          <X size={15} />
        </button>
      </div>
      {children}
    </div>
  )
}

/** 状态/标签区 */
function MetaSection({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-1.5">{children}</div>
}

/** 操作区 */
function ActionSection({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex gap-2 border-t border-line pt-4">{children}</div>
}

function EmptyInspector({ onClose }: { onClose: () => void }) {
  return (
    <InspectorShell title="详情" onClose={onClose}>
      <p className="py-6 text-center text-sm text-ink-faint">该项已不存在</p>
    </InspectorShell>
  )
}
