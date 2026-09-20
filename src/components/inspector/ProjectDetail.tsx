/**
 * Inspector · 项目详情（含项目档案聚合：任务 / 笔记 / 情报）
 */
import { ExternalLink } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useNoteStore } from '../../stores/useNoteStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { Badge, Button } from '../ui'
import { useInspectorStore } from './inspector-store'
import { ActionSection, EmptyInspector, InspectorShell } from './shared'

export function ProjectDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const setSection = useAppStore((s) => s.setSection)
  const proj = useProjectStore((s) => s.items.find((x) => x.id === id))
  // 项目聚合：按 projectId 关联 任务 / 笔记 / 情报
  const allTasks = useTaskStore((s) => s.items)
  const allNotes = useNoteStore((s) => s.items)
  // zustand v5 走 useSyncExternalStore：selector 必须返回稳定引用，
  // 在 selector 里 .filter() 会每次生成新数组 → 无限重渲染（React #185）
  const allIntel = useIntelligenceStore((s) => s.items)

  if (!proj) return <EmptyInspector onClose={onClose} />

  const projTasks = allTasks.filter((t) => t.projectId === id)
  const projNotes = allNotes.filter((n) => n.projectId === id)
  const projIntel = allIntel.filter((x) => x.projectId === id)

  return (
    <InspectorShell title="项目详情" onClose={onClose}>
      <div className="flex items-center gap-2">
        {/* min-w-0 + break-words：长项目名（尤其无空格的拉丁长词）能在窄屏折行而非撑破整行 */}
        <h3 className="display min-w-0 break-words text-lg font-semibold text-ink">{proj.name}</h3>
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
        <a href={proj.repo.startsWith('http') ? proj.repo : `https://github.com/${proj.repo}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-w-0 max-w-full items-center gap-1 text-sm text-teal link-underline">
          {/* 仓库地址常是无空格长串，min-w-0 + break-all 让它在底部 Sheet 内折行而非越出屏外 */}
          <ExternalLink size={14} className="shrink-0" />
          <span className="break-all">{proj.repo}</span>
        </a>
      )}
      {/* 项目档案聚合：任务 / 笔记 / 情报 */}
      {(projTasks.length > 0 || projNotes.length > 0 || projIntel.length > 0) && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 text-xs tracking-[0.2em] text-ink-faint">项目档案 · ARCHIVE</div>
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
