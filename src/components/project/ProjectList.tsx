/**
 * ProjectList —— 项目中心（藏）
 * 名称/仓库/简介/技术栈/状态/进度/开始/目标/下一步/里程碑/备注
 * 预留：GitHub API 自动同步
 */
import { useState } from 'react'
import { ExternalLink, Eye, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../stores/useProjectStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useNoteStore } from '../../stores/useNoteStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useInspectorStore } from '../inspector/Inspector'
import { recordActivity } from '../../services/activity'
import type { Project, ProjectStatus } from '../../types/entities'
import { createId } from '../../utils/id'
import { cn } from '../../utils/cn'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Progress,
  Section,
  Select,
  Textarea,
  useToast,
} from '../ui'

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: '规划',
  developing: '开发中',
  maintaining: '维护',
  paused: '暂停',
  done: '完成',
}

const STATUS_TONE: Record<ProjectStatus, 'plain' | 'cinnabar' | 'bronze' | 'teal'> = {
  planning: 'plain',
  developing: 'cinnabar',
  maintaining: 'teal',
  paused: 'plain',
  done: 'bronze',
}

const STATUS_ORDER: ProjectStatus[] = ['planning', 'developing', 'maintaining', 'paused', 'done']

interface FormState {
  name: string
  repo: string
  description: string
  stack: string
  status: ProjectStatus
  progress: string
  startDate: string
  goal: string
  nextStep: string
  notes: string
}

const EMPTY: FormState = {
  name: '',
  repo: '',
  description: '',
  stack: '',
  status: 'planning',
  progress: '0',
  startDate: '',
  goal: '',
  nextStep: '',
  notes: '',
}

export function ProjectList() {
  const projects = useProjectStore((s) => s.items)
  const tasks = useTaskStore((s) => s.items)
  const notes = useNoteStore((s) => s.items)
  const intel = useIntelligenceStore((s) => s.items)
  const toast = useToast().toast
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY })
  const [milestoneText, setMilestoneText] = useState('')

  const list = projects
    .filter((p) => statusFilter === 'all' || p.status === statusFilter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const openNew = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setMilestoneText('')
    setOpen(true)
  }
  const openEdit = (p: Project) => {
    setEditing(p)
    setForm({
      name: p.name,
      repo: p.repo ?? '',
      description: p.description ?? '',
      stack: p.stack?.join(' '),
      status: p.status,
      progress: String(p.progress),
      startDate: p.startDate ?? '',
      goal: p.goal ?? '',
      nextStep: p.nextStep ?? '',
      notes: p.notes ?? '',
    })
    setMilestoneText(p.milestones.map((m) => m.title).join('，'))
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    const now = new Date().toISOString()
    const milestones = milestoneText
      .split(/[，,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title) => ({ id: createId(), title, done: false }))
    await useProjectStore.getState().save({
      id: editing?.id ?? createId(),
      name: form.name.trim(),
      repo: form.repo.trim() || undefined,
      description: form.description.trim() || undefined,
      stack: form.stack.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean),
      status: form.status,
      progress: Math.max(0, Math.min(100, Number(form.progress) || 0)),
      startDate: form.startDate || undefined,
      goal: form.goal.trim() || undefined,
      nextStep: form.nextStep.trim() || undefined,
      milestones,
      notes: form.notes.trim() || undefined,
      favorite: editing?.favorite ?? false,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    })
    setOpen(false)
    toast(editing ? '项目已更新' : '项目已建立', 'success')
    if (!editing) {
      void recordActivity({ entityType: 'project', entityId: form.name.trim(), title: `建立项目：${form.name.trim().slice(0, 30)}` })
    }
  }

  const remove = async (p: Project) => {
    await useProjectStore.getState().remove(p.id)
    toast('已删除')
  }
  const toggleFav = async (p: Project) => {
    await useProjectStore.getState().update(p.id, {
      favorite: !p.favorite,
      updatedAt: new Date().toISOString(),
    })
  }
  const toggleMilestone = async (p: Project, id: string) => {
    const milestones = p.milestones.map((m) =>
      m.id === id ? { ...m, done: !m.done } : m,
    )
    const progress = Math.round((milestones.filter((m) => m.done).length / Math.max(1, milestones.length)) * 100)
    await useProjectStore.getState().update(p.id, { milestones, progress, updatedAt: new Date().toISOString() })
  }

  return (
    <Section
      title="项目中心"
      hint={`${projects.length} 个`}
      action={
        <Button size="sm" variant="primary" onClick={openNew}>
          <Plus size={13} /> 新建项目
        </Button>
      }
    >
      {/* 状态筛选 */}
      <div className="mb-3 flex flex-wrap gap-1">
        <button
          onClick={() => setStatusFilter('all')}
          className={cn(
            'rounded-tile px-2.5 py-1 text-xs transition-colors',
            statusFilter === 'all' ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
          )}
        >
          全部
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-tile px-2.5 py-1 text-xs transition-colors',
              statusFilter === s ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map((p) => (
            <div key={p.id} className="rounded-paper border border-line p-4 transition-colors hover:border-line-strong">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{p.name}</span>
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    {p.repo && (
                      <a
                        href={p.repo.startsWith('http') ? p.repo : `https://github.com/${p.repo}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[11px] text-teal link-underline"
                      >
                        <ExternalLink size={11} /> {p.repo}
                      </a>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.stack?.slice(0, 5).map((t) => (
                      <span key={t} className="text-[11px] text-ink-faint">#{t}</span>
                    ))}
                  </div>
                  {/* 进度 */}
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={p.progress} className="max-w-[200px]" bronze={p.status === 'done'} />
                    <span className="tabular text-[11px] text-ink-faint">{p.progress}%</span>
                  </div>
                  {/* 里程碑 */}
                  {p.milestones.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.milestones.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => toggleMilestone(p, m.id)}
                          className={cn(
                            'rounded-control border px-1.5 py-0.5 text-[11px] transition-colors',
                            m.done
                              ? 'border-cinnabar/50 bg-cinnabar/5 text-cinnabar line-through'
                              : 'border-line text-ink-muted hover:border-line-strong',
                          )}
                        >
                          {m.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {p.nextStep && (
                    <div className="mt-2 text-[11px] text-ink-muted">
                      下一步：<span className="text-ink-soft">{p.nextStep}</span>
                    </div>
                  )}
                  {/* 项目档案：关联 任务/笔记/情报 计数 */}
                  <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                    <span>档案 · 任务 {tasks.filter((t) => t.projectId === p.id).length}</span>
                    <span>笔记 {notes.filter((n) => n.projectId === p.id).length}</span>
                    <span>情报 {intel.filter((x) => x.projectId === p.id).length}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    onClick={() => useInspectorStore.getState().open('project', p.id)}
                    className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink"
                    aria-label="详情"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => toggleFav(p)}
                    className={cn('rounded-control p-1.5', p.favorite ? 'text-bronze' : 'text-ink-faint hover:text-bronze')}
                    aria-label="收藏"
                  >
                    <Star size={14} fill={p.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => openEdit(p)} aria-label="编辑">
                    <Pencil size={14} />
                  </button>
                  <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => remove(p)} aria-label="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={projects.length === 0 ? '还没有项目' : '没有该状态的项目'}
          desc="管理你的作品、开源项目与长期工程"
          action={
            projects.length === 0 ? (
              <Button variant="primary" onClick={openNew}>
                <Plus size={13} /> 建立项目
              </Button>
            ) : undefined
          }
        />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '改项目' : '新建项目'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={!form.name.trim()}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus placeholder="项目名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="仓库地址（owner/repo 或 URL）" value={form.repo} onChange={(e) => setForm({ ...form, repo: e.target.value })} />
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <Textarea placeholder="简介" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="技术栈（空格分隔）" value={form.stack} onChange={(e) => setForm({ ...form, stack: e.target.value })} />
            <Input type="number" min={0} max={100} placeholder="进度 0-100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} aria-label="开始时间" />
            <Input placeholder="目标" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
          </div>
          <Input placeholder="下一步" value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} />
          <Input placeholder="里程碑（顿号分隔）" value={milestoneText} onChange={(e) => setMilestoneText(e.target.value)} />
          <Textarea placeholder="备注" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Dialog>
    </Section>
  )
}
