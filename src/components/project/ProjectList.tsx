/**
 * ProjectList —— 项目中心（藏）
 * 名称/仓库/简介/技术栈/状态/进度/开始/目标/下一步/里程碑/备注
 * 预留：GitHub API 自动同步
 */
import { useState } from 'react'
import { ExternalLink, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../stores/useProjectStore'
import { useInspectorStore } from '../inspector/Inspector'
import { recordActivity } from '../../services/activity'
import type { Project, ProjectStatus } from '../../types/entities'
import { createId } from '../../utils/id'
import { cn } from '../../utils/cn'
import {
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {list.map((p) => (
            <div
              key={p.id}
              onClick={() => useInspectorStore.getState().open('project', p.id)}
              className="group relative flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-tile border border-line bg-raised transition-all duration-fast hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98]"
            >
              {/* 左侧状态签条（与藏品同语言） */}
              <span
                className={cn(
                  'absolute inset-y-0 left-0 w-[3px]',
                  p.status === 'done'
                    ? 'bg-teal/60'
                    : p.status === 'developing'
                      ? 'bg-cinnabar/55'
                      : p.status === 'maintaining'
                        ? 'bg-teal/40'
                        : 'bg-gold-btn/70',
                )}
              />
              <div className="flex flex-1 flex-col p-3 pl-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-ink-muted">{STATUS_LABEL[p.status]}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleFav(p)
                    }}
                    className={cn(
                      'rounded-[4px] p-1.5 transition-colors',
                      p.favorite ? 'text-bronze' : 'text-ink-faint hover:text-bronze',
                    )}
                    aria-label="收藏"
                  >
                    <Star size={15} fill={p.favorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
                {/* 标题区：居中书法大字 */}
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-1 text-center">
                  <span className="scribal-title line-clamp-2 text-xl leading-snug text-ink">{p.name}</span>
                  {p.repo && (
                    <a
                      href={p.repo.startsWith('http') ? p.repo : `https://github.com/${p.repo}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex max-w-full items-center gap-0.5 truncate text-[11px] text-teal link-underline"
                    >
                      <ExternalLink size={11} /> {p.repo}
                    </a>
                  )}
                  {p.nextStep && (
                    <span className="line-clamp-2 text-[11px] leading-relaxed text-ink-muted">
                      下一步 · {p.nextStep}
                    </span>
                  )}
                </div>
                {/* 底部：进度 + 操作 */}
                <div className="mt-2 border-t border-line/70 pt-2">
                  <div className="flex items-center gap-2">
                    <Progress value={p.progress} className="flex-1" bronze={p.status === 'done'} />
                    <span className="tabular text-[11px] text-ink-faint">{p.progress}%</span>
                  </div>
                  {p.milestones.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.milestones.slice(0, 3).map((m) => (
                        <span
                          key={m.id}
                          className={cn(
                            'rounded-control border px-1.5 py-0.5 text-[10px]',
                            m.done
                              ? 'border-cinnabar/50 bg-cinnabar/5 text-cinnabar line-through'
                              : 'border-line text-ink-faint',
                          )}
                        >
                          {m.title}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* 操作：编辑 / 删除（与藏品保持同一语言，小图标常显） */}
                  <div className="mt-2 flex justify-end gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(p)
                      }}
                      className="rounded-control p-1 text-ink-muted transition-colors hover:bg-nested hover:text-ink"
                      aria-label="编辑"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void remove(p)
                      }}
                      className="rounded-control p-1 text-ink-muted transition-colors hover:bg-nested hover:text-cinnabar"
                      aria-label="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
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
                <Plus size={13} /> 新建项目
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
