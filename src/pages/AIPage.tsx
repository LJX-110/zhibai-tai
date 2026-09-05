/**
 * 术 —— AI Workshop（工作台感，非管理后台）
 * 顶部：Models / Tools / Skills / Agents / Plugins / Prompts / Workflows
 * 快速开始：添加第一个模型 / Skill / Agent / 导入 Prompt；空态也有完整结构
 */
import { useState } from 'react'
import { Bot, Box, Cpu, FileText, Hammer, Plug, Power, Plus, Search, Sparkles, Workflow } from 'lucide-react'
import { useAIResourceStore } from '../stores/useAIStore'
import { useInspectorStore } from '../components/inspector/Inspector'
import { AITasks } from '../components/ai/AITasks'
import type { AIResource, AIResourceType } from '../types/entities'
import { createId } from '../utils/id'
import { cn } from '../utils/cn'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
  Textarea,
  useToast,
} from '../components/ui'

const TYPE_LABEL: Record<AIResourceType, string> = {
  model: '模型',
  tool: 'Tool',
  skill: 'Skill',
  agent: 'Agent',
  plugin: 'Plugin',
  prompt: 'Prompt',
  workflow: 'Workflow',
}

const TYPE_ORDER: AIResourceType[] = [
  'model',
  'tool',
  'skill',
  'agent',
  'plugin',
  'prompt',
  'workflow',
]

/** 分类图标 */
const TYPE_ICON: Record<AIResourceType, typeof Bot> = {
  model: Cpu,
  tool: Hammer,
  skill: Sparkles,
  agent: Bot,
  plugin: Plug,
  prompt: FileText,
  workflow: Workflow,
}

/** 快速开始（空态产品入口） */
const QUICK_START: { type: AIResourceType; label: string; desc: string; icon: typeof Bot }[] = [
  { type: 'model', label: '添加第一个模型', desc: '登记本地或云端模型', icon: Cpu },
  { type: 'skill', label: '添加 Skill', desc: '沉淀可复用的技能', icon: Sparkles },
  { type: 'agent', label: '添加 Agent', desc: '定义你的智能体', icon: Bot },
  { type: 'prompt', label: '导入 Prompt', desc: '保存常用提示词', icon: FileText },
]

export function AIPage() {
  const resources = useAIResourceStore((s) => s.items)
  const toast = useToast().toast
  const [typeFilter, setTypeFilter] = useState<AIResourceType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AIResource | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'model' as AIResourceType,
    provider: '',
    description: '',
    tags: '',
    config: '',
  })

  const list = resources
    .filter((r) => typeFilter === 'all' || r.type === typeFilter)
    .filter((r) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const countOf = (t: AIResourceType) => resources.filter((r) => r.type === t).length

  const openNew = (type?: AIResourceType) => {
    setEditing(null)
    setForm({
      name: '',
      type: type ?? (typeFilter === 'all' ? 'model' : typeFilter),
      provider: '',
      description: '',
      tags: '',
      config: '',
    })
    setOpen(true)
  }
  const openEdit = (r: AIResource) => {
    setEditing(r)
    setForm({
      name: r.name,
      type: r.type,
      provider: r.provider ?? '',
      description: r.description ?? '',
      tags: r.tags.join(' '),
      config: r.config ?? '',
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    const now = new Date().toISOString()
    await useAIResourceStore.getState().save({
      id: editing?.id ?? createId(),
      name: form.name.trim(),
      type: form.type,
      provider: form.provider.trim() || undefined,
      description: form.description.trim() || undefined,
      config: form.config.trim() || undefined,
      tags: form.tags.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean),
      enabled: editing?.enabled ?? true,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    })
    setOpen(false)
    toast(editing ? '已更新' : '已登记', 'success')
  }

  const toggleEnabled = async (r: AIResource) => {
    await useAIResourceStore.getState().update(r.id, {
      enabled: !r.enabled,
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <h1 className="scribal-title text-3xl text-ink-bright">AI 工作台</h1>
          <p className="scribal mt-1.5 text-base text-ink-muted">工欲善其事，必先利其器</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => openNew()}>
          <Plus size={14} /> 登记能力
        </Button>
      </div>

      {/* 分类顶部条（带计数） */}
      <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'group flex flex-col items-start gap-1 rounded-tile border px-3 py-2.5 text-left transition-colors',
            typeFilter === 'all'
              ? 'border-cinnabar/40 bg-cinnabar/5'
              : 'border-line bg-panel hover:border-line-strong',
          )}
        >
          <span className={cn('text-sm font-medium', typeFilter === 'all' ? 'text-cinnabar' : 'text-ink')}>
            全部
          </span>
          <span className="tabular text-[11px] text-ink-faint">{resources.length}</span>
        </button>
        {TYPE_ORDER.map((t) => {
          const Icon = TYPE_ICON[t]
          const active = typeFilter === t
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'group flex flex-col items-start gap-1 rounded-tile border px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-cinnabar/40 bg-cinnabar/5'
                  : 'border-line bg-panel hover:border-line-strong',
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon size={13} className={active ? 'text-cinnabar' : 'text-ink-faint'} />
                <span className={cn('text-sm font-medium', active ? 'text-cinnabar' : 'text-ink')}>
                  {TYPE_LABEL[t]}
                </span>
              </span>
              <span className="tabular text-[11px] text-ink-faint">{countOf(t)}</span>
            </button>
          )
        })}
      </div>

      {/* 搜索 */}
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="搜索能力 / 标签"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="!pl-9"
        />
      </div>

      {/* 空态：完整工作台结构 */}
      {resources.length === 0 && (
        <div className="talisman p-6">
          <EmptyState
            icon={Box}
            title="你的术还没有收藏任何能力"
            desc="模型、Skill、Agent、Prompt、Workflow 都可以登记到这里，形成可复用的 AI 能力库"
            step="从下面任一入口开始"
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
            {QUICK_START.map((q) => {
              const Icon = q.icon
              return (
                <button
                  key={q.type}
                  onClick={() => openNew(q.type)}
                  className="group flex flex-col items-start gap-2 rounded-tile border border-line bg-paper/70 px-4 py-3.5 text-left transition-colors hover:border-cinnabar/40 hover:bg-cinnabar/5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-line bg-raised text-ink-muted group-hover:text-cinnabar">
                    <Icon size={15} />
                  </span>
                  <span className="text-sm font-medium text-ink">{q.label}</span>
                  <span className="text-[11px] text-ink-faint">{q.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 资源列表 */}
      {resources.length > 0 && (
        <div>
          {list.length > 0 ? (
            <div>
              {list.map((r) => (
                <div key={r.id} className="row">
                  <button
                    onClick={() => useInspectorStore.getState().open('ai', r.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`查看 ${r.name} 详情`}
                  >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-control border',
                      r.enabled ? 'border-teal/30 bg-teal/10 text-teal' : 'border-line bg-raised text-ink-faint',
                    )}
                  >
                    {(() => {
                      const Icon = TYPE_ICON[r.type]
                      return <Icon size={15} />
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm font-medium', r.enabled ? 'text-ink' : 'text-ink-faint')}>
                        {r.name}
                      </span>
                      <Badge tone="teal">{TYPE_LABEL[r.type]}</Badge>
                      {r.provider && <span className="text-[11px] text-ink-muted">{r.provider}</span>}
                    </div>
                    {r.description && (
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-muted">{r.description}</p>
                    )}
                    <div className="mt-0.5 flex flex-wrap gap-x-2">
                      {r.tags.slice(0, 4).map((t) => (
                        <span key={t} className="text-[11px] text-ink-faint">#{t}</span>
                      ))}
                    </div>
                  </div>
                  </button>
                  <button
                    onClick={() => toggleEnabled(r)}
                    className={cn(
                      'flex items-center gap-1 rounded-control px-2 py-1.5 text-xs transition-colors',
                      r.enabled ? 'text-teal' : 'text-ink-faint',
                    )}
                    aria-label={r.enabled ? '停用' : '启用'}
                  >
                    <Power size={13} /> {r.enabled ? '启用' : '停用'}
                  </button>
                  <Button size="sm" variant="tertiary" onClick={() => openEdit(r)}>
                    编辑
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="没有符合搜索的能力"
              desc="换个关键词，或清空搜索"
              action={
                <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                  清空搜索
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* AI 任务：一键生成简报/计划/摘要 */}
      <AITasks />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '改 AI 能力' : '登记 AI 能力'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={!form.name.trim()}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AIResourceType })}>
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </Select>
            <Input placeholder="提供方（可选）" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </div>
          <Textarea placeholder="描述（可选）" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input placeholder="#标签" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <Textarea
            placeholder="配置 JSON（可选）"
            value={form.config}
            onChange={(e) => setForm({ ...form, config: e.target.value })}
            className="font-mono !text-xs"
          />
        </div>
      </Dialog>
    </div>
  )
}
