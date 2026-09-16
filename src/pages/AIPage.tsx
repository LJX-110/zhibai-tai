/**
 * 术 —— AI 能力库（同藏/情风格：登记即用，可启停/编辑/删除）
 * AI 任务（简报/计划/摘要）已收编入「天机」，这里只做资源的登记与管理。
 */
import { useMemo, useState } from 'react'
import { Bot, Box, Cpu, FileText, Hammer, Plug, Plus, Power, Search, Sparkles, Trash2, Workflow } from 'lucide-react'
import { useAIResourceStore } from '../stores/useAIStore'
import { addCategory, categoryNames, removeCategory, resetCategories, useCategoryStore } from '../stores/useCategoryStore'
import { useInspectorStore } from '../components/inspector/Inspector'
import { useAIChatStore } from '../components/ai/AiChatPanel'
import type { AIResource, AIResourceType } from '../types/entities'
import { createId } from '../utils/id'
import { cn } from '../utils/cn'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  ScrollRow,
  Select,
  Textarea,
  Tooltip,
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

/** 自定义类型的展示兜底：内置查表，自定义类型直接用其名称/默认图标 */
const typeLabel = (t: string) => TYPE_LABEL[t as AIResourceType] ?? t
const typeIcon = (t: string) => TYPE_ICON[t as AIResourceType] ?? Box
/** 内置类型名不可被自定义占用（删除语义不可逆） */
const isBuiltinType = (t: string) => (TYPE_ORDER as string[]).includes(t)

/** 空态：一句引导 + 登记入口（不铺大排快速开始卡） */

export function AIPage() {
  const resources = useAIResourceStore((s) => s.items)
  const toast = useToast().toast
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AIResource | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'model',
    provider: '',
    description: '',
    category: '',
    tags: '',
    config: '',
  })

  // 分类来自业务表（跨设备同步，与藏/情同一套机制）；派生结果在组件体内算
  const categoryRows = useCategoryStore((s) => s.items)
  const aiCategories = useMemo(() => categoryNames(categoryRows, 'ai'), [categoryRows])
  // 自定义类型同样走业务表：scope 'ai_type'，增删跨设备同步
  const aiTypes = useMemo(() => categoryNames(categoryRows, 'ai_type'), [categoryRows])
  const [catFilter, setCatFilter] = useState<'all' | string>('all')
  const [catMgrOpen, setCatMgrOpen] = useState(false)
  const [catDraft, setCatDraft] = useState('')
  const [typeMgrOpen, setTypeMgrOpen] = useState(false)
  const [typeDraft, setTypeDraft] = useState('')

  const list = resources
    .filter((r) => typeFilter === 'all' || r.type === typeFilter)
    .filter((r) => {
      if (catFilter === 'all') return true
      // 「其他」聚合未分类或已不存在的分类
      if (catFilter === '其他') return !r.category || !aiCategories.includes(r.category)
      return r.category === catFilter
    })
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

  const countOf = (t: string) => resources.filter((r) => r.type === t).length

  const openNew = (type?: string) => {
    setEditing(null)
    setForm({
      name: '',
      type: type ?? (typeFilter === 'all' ? 'model' : typeFilter),
      provider: '',
      description: '',
      category: '',
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
      category: r.category ?? '',
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
      category: form.category.trim() || undefined,
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

  /** 分类管理：就地增删（移除不影响已有能力，仅收起筛选页签） */
  const addAiCategory = () => {
    const t = catDraft.trim()
    if (!t) return
    void addCategory('ai', t)
    setCatDraft('')
  }

  /** 类型管理：内置名不可重复建；删自定义类型不动其下能力（在「全部」仍可见） */
  const addAiType = () => {
    const t = typeDraft.trim()
    if (!t) return
    if (isBuiltinType(t)) {
      toast(`「${t}」是内置类型，无需新建`, 'danger')
      return
    }
    void addCategory('ai_type', t)
    setTypeDraft('')
  }
  const removeAiType = (name: string) => {
    void removeCategory('ai_type', name)
    if (typeFilter === name) setTypeFilter('all')
  }

  /** 登记进来的能力也得能删掉，否则列表只会越堆越长 */
  const remove = async (r: AIResource) => {
    await useAIResourceStore.getState().remove(r.id)
    toast('已删除')
  }

  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      {/* 页头：与其它板块统一（PageHeader） */}
      <PageHeader
        title="术 · 能力库"
        poem="工欲善其事，必先利其器"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => useAIChatStore.getState().setOpen(true)}>
              <Bot size={14} /> 打开天机
            </Button>
            <Button variant="primary" size="sm" onClick={() => openNew()}>
              <Plus size={14} /> 登记能力
            </Button>
          </div>
        }
      />

      {/* 分类顶部条（带计数）：手机上 4 列过挤，改为 2 行 × 3/4 列的紧凑网格 */}
      <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-7 max-[420px]:grid-cols-3">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'group flex flex-col items-start gap-1 rounded-tile border px-3 py-2.5 text-left transition-colors',
            typeFilter === 'all'
              ? 'border-cinnabar/40 bg-cinnabar/5'
              : 'border-line bg-paper/40 hover:border-line-strong',
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
                  : 'border-line bg-paper/40 hover:border-line-strong',
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
        {/** 自定义类型：与内置同款卡片，默认图标兜底 */}
        {aiTypes.map((t) => {
          const Icon = typeIcon(t)
          const active = typeFilter === t
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'group flex flex-col items-start gap-1 rounded-tile border px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-cinnabar/40 bg-cinnabar/5'
                  : 'border-line bg-paper/40 hover:border-line-strong',
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon size={13} className={active ? 'text-cinnabar' : 'text-ink-faint'} />
                <span className={cn('text-sm font-medium', active ? 'text-cinnabar' : 'text-ink')}>
                  {t}
                </span>
              </span>
              <span className="tabular text-[11px] text-ink-faint">{countOf(t)}</span>
            </button>
          )
        })}
        {/* 类型管理入口：常显，空库也能建自定义类型 */}
        <button
          onClick={() => setTypeMgrOpen(true)}
          aria-label="管理类型"
          className="flex flex-col items-start justify-center gap-1 rounded-tile border border-dashed border-line-strong/70 px-3 py-2.5 text-left text-ink-faint transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
        >
          <Plus size={14} />
          <span className="text-xs">管理类型</span>
        </button>
      </div>

      {/* 分类行（与藏/情同语言：全部 + 自定义分类 + 其他 + 行尾管理）。
          空库也常显：分类管理「＋」入口不能被资源数为零藏起来 */}
      <ScrollRow className="mb-4" activeSelector={'[data-active="true"]'} activeKey={catFilter}>
          <button
            data-active={catFilter === 'all' || undefined}
            onClick={() => setCatFilter('all')}
            className={cn(
              'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
              catFilter === 'all' ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
            )}
          >
            全部
          </button>
          {aiCategories.map((c) => {
            const count = resources.filter((r) => r.category === c).length
            return (
              <button
                key={c}
                data-active={catFilter === c || undefined}
                onClick={() => setCatFilter(c)}
                className={cn(
                  'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
                  catFilter === c ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
                )}
              >
                {c} <span className="tabular text-xs opacity-60">{count}</span>
              </button>
            )
          })}
          <button
            data-active={catFilter === '其他' || undefined}
            onClick={() => setCatFilter('其他')}
            className={cn(
              'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
              catFilter === '其他' ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
            )}
          >
            其他{' '}
            <span className="tabular text-xs opacity-60">
              {resources.filter((r) => !r.category || !aiCategories.includes(r.category)).length}
            </span>
          </button>
          <Tooltip label="管理分类">
            <button
              onClick={() => setCatMgrOpen(true)}
              className="shrink-0 rounded-tile bg-raised p-2 text-ink-muted transition-colors hover:bg-nested hover:text-ink"
              aria-label="管理分类"
            >
              <Plus size={14} />
            </button>
          </Tooltip>
      </ScrollRow>

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

      {/* 空态：一句引导 + 登记入口（不再铺一大排快速开始卡） */}
      {resources.length === 0 && (
        <div className="talisman talisman--line p-6">
          <EmptyState
            icon={Box}
            title="术库还是空的"
            desc="模型、Tool、Skill、Agent、Prompt 都可以登记到这里，形成可复用的 AI 能力库"
            action={
              <Button variant="primary" onClick={() => openNew()}>
                <Plus size={13} /> 登记能力
              </Button>
            }
          />
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
                      const Icon = typeIcon(r.type)
                      return <Icon size={15} />
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm font-medium', r.enabled ? 'text-ink' : 'text-ink-faint')}>
                        {r.name}
                      </span>
                      <Badge tone="teal">{typeLabel(r.type)}</Badge>
                      {r.category && <Badge tone="bronze">{r.category}</Badge>}
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
                    <Power size={13} /> {r.enabled ? '停用' : '启用'}
                  </button>
                  <Button size="sm" variant="tertiary" onClick={() => openEdit(r)}>
                    编辑
                  </Button>
                  <button
                    onClick={() => remove(r)}
                    className="rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-cinnabar"
                    aria-label="删除"
                    title="删除该能力"
                  >
                    <Trash2 size={14} />
                  </button>
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

      {/* AI 任务已收编入「天机」：对话底部快捷能力一键运行，见 AiChatPanel */}

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
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {[...TYPE_ORDER, ...aiTypes].map((t) => (
                  <option key={t} value={t}>{typeLabel(t)}</option>
                ))}
              </Select>
            <Input placeholder="提供方（可选）" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </div>
          <Textarea placeholder="描述（可选）" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {/* 用法分类：与藏/情一致的业务分类（可增删、跨设备同步） */}
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">无分类</option>
            {aiCategories.filter((c) => c !== '其他').map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Input placeholder="#标签" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <Textarea
            placeholder="配置 JSON（可选）"
            value={form.config}
            onChange={(e) => setForm({ ...form, config: e.target.value })}
            className="font-mono !text-xs"
          />
        </div>
      </Dialog>

      {/* 分类管理：与藏/情同交互（增/删/恢复默认），附各分类资源数 */}
      <Dialog open={catMgrOpen} onClose={() => setCatMgrOpen(false)} title="管理术库分类">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {aiCategories.map((c) => {
              const count = resources.filter((r) => r.category === c).length
              return (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink-soft"
                >
                  {c}
                  <span className="tabular text-[10px] text-ink-faint">{count}</span>
                  <button
                    onClick={() => {
                      void removeCategory('ai', c)
                      if (catFilter === c) setCatFilter('all')
                    }}
                    className="text-ink-faint transition-colors hover:text-cinnabar"
                    aria-label={`移除 ${c}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={catDraft}
              onChange={(e) => setCatDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAiCategory()}
              placeholder="新增分类名…"
              className="max-w-[200px]"
            />
            <Button size="sm" variant="secondary" onClick={() => addAiCategory()} disabled={!catDraft.trim()}>
              <Plus size={13} /> 添加
            </Button>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <p className="text-[11px] text-ink-faint">移除分类不删能力，相关的归入「其他」</p>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => {
                void resetCategories('ai')
                setCatFilter('all')
              }}
            >
              恢复默认
            </Button>
          </div>
        </div>
      </Dialog>
      {/* 类型管理：增删自定义类型（跨设备同步）；内置 7 类不可删 */}
      <Dialog open={typeMgrOpen} onClose={() => setTypeMgrOpen(false)} title="管理术库类型">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {aiTypes.map((t) => {
              const count = resources.filter((r) => r.type === t).length
              return (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink-soft"
                >
                  {t}
                  <span className="tabular text-[10px] text-ink-faint">{count}</span>
                  <button
                    onClick={() => removeAiType(t)}
                    className="text-ink-faint transition-colors hover:text-cinnabar"
                    aria-label={`移除 ${t}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              )
            })}
            {aiTypes.length === 0 && (
              <p className="text-xs text-ink-faint">还没有自定义类型</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={typeDraft}
              onChange={(e) => setTypeDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAiType()}
              placeholder="新增类型名…"
              className="max-w-[200px]"
            />
            <Button size="sm" variant="secondary" onClick={addAiType} disabled={!typeDraft.trim()}>
              <Plus size={13} /> 添加
            </Button>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <p className="text-[11px] text-ink-faint">
              移除自定义类型不删能力，相关条目仍在「全部」可见；内置类型不可删
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
