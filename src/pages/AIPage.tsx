/**
 * 术 —— AI 能力库（登记即用，可启停/编辑/删除）
 * AI 任务（简报/计划/摘要）已收编入「天机」，这里只做资源的登记与管理。
 *
 * 类型**完全数据化**：内置 7 类（模型/Tool/Skill/Agent/Plugin/Prompt/Workflow）
 * 已播种进 categories 表（scope 'ai_type'），与用户新建的类型**同等可增删改**；
 * 「用法分类」行已移除 —— 它与类型功能重复，且没有独立存在的价值。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：类型网格、能力行、登记弹窗、类型管理弹窗
 * 各自成文件放在 ./ai/ 下；本文件只留状态、数据流与组合。
 */
import { useMemo, useState } from 'react'
import { Bot, Box, Plus, Search } from 'lucide-react'
import { recordActivity } from '../services/activity'
import { useAIResourceStore } from '../stores/useAIStore'
import { addCategory, categoryNames, removeCategory, useCategoryStore } from '../stores/useCategoryStore'
import { useInspectorStore } from '../components/inspector/inspector-store'
import { useAIChatStore } from '../components/ai/chat-store'
import type { AIResource } from '../types/entities'
import { createId, nowISO } from '../utils/id'
import { Button, EmptyState, Input, PageHeader, useToast } from '../components/ui'
import { TypeGrid } from './ai/TypeGrid'
import { ResourceRow } from './ai/ResourceRow'
import { ResourceFormDialog } from './ai/ResourceFormDialog'
import { TypeManagerDialog } from './ai/TypeManagerDialog'
import { EMPTY_AI_FORM, type AiFormState } from './ai/shared'

export function AIPage() {
  const resources = useAIResourceStore((s) => s.items)
  const toast = useToast().toast
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AIResource | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<AiFormState>({ ...EMPTY_AI_FORM })

  // 类型全部来自业务表（scope 'ai_type'，跨设备同步）；派生数据在组件体内算
  const categoryRows = useCategoryStore((s) => s.items)
  const aiTypes = useMemo(() => categoryNames(categoryRows, 'ai_type'), [categoryRows])
  const [typeMgrOpen, setTypeMgrOpen] = useState(false)
  const [typeDraft, setTypeDraft] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

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

  const countOf = (t: string) => resources.filter((r) => r.type === t).length

  const openNew = (type?: string) => {
    setEditing(null)
    setForm({
      ...EMPTY_AI_FORM,
      type: type ?? (typeFilter === 'all' ? '模型' : typeFilter),
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
    const now = nowISO()
    const saved = {
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
    }
    await useAIResourceStore.getState().save(saved)
    // 记一条动作流水 —— 「术」板块是九板块里此前唯一没有流水的，
    // 不记的话在这个板块做的事不会算进功行（修行只覆盖 8/9 就失去意义）
    if (!editing) {
      void recordActivity({
        entityType: 'ai',
        entityId: saved.id,
        title: `登记 ${saved.name}`,
      })
    }
    setOpen(false)
    toast(editing ? '已更新' : '已登记', 'success')
  }

  const toggleEnabled = async (r: AIResource) => {
    await useAIResourceStore.getState().update(r.id, {
      enabled: !r.enabled,
      updatedAt: nowISO(),
    })
  }

  /** 新增类型：与既有类型同名时拒绝（同名即同一条，业务表幂等） */
  const addAiType = async () => {
    const t = typeDraft.trim()
    if (!t) return
    if (aiTypes.includes(t)) {
      toast(`「${t}」已存在`, 'danger')
      return
    }
    await addCategory('ai_type', t)
    setTypeDraft('')
  }

  /**
   * 改名：所属能力的类型值**同步迁移**到新名，然后删旧行、建新行。
   * 旧行删除走墓碑，会同步到其他设备。
   */
  const renameAiType = async (from: string) => {
    const t = renameDraft.trim()
    if (!t || t === from) {
      setRenaming(null)
      return
    }
    if (aiTypes.includes(t)) {
      toast(`「${t}」已存在`, 'danger')
      return
    }
    for (const r of resources.filter((x) => x.type === from)) {
      await useAIResourceStore.getState().update(r.id, {
        type: t,
        updatedAt: nowISO(),
      })
    }
    await removeCategory('ai_type', from)
    await addCategory('ai_type', t)
    setRenaming(null)
    if (typeFilter === from) setTypeFilter(t)
  }

  /** 删除类型：不删能力，相关条目保留原名、在「全部」仍可见 */
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

      {/* 类型网格 —— 数据化后唯一的一套类型体系（可增/删/改名） */}
      <TypeGrid
        types={aiTypes}
        active={typeFilter}
        total={resources.length}
        countOf={countOf}
        onSelect={setTypeFilter}
        onManage={() => setTypeMgrOpen(true)}
      />

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

      {/* 空态：一句引导 + 登记入口 */}
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
                <ResourceRow
                  key={r.id}
                  r={r}
                  onOpen={() => useInspectorStore.getState().open('ai', r.id)}
                  onToggle={() => void toggleEnabled(r)}
                  onEdit={() => openEdit(r)}
                  onRemove={() => void remove(r)}
                />
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

      <ResourceFormDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing != null}
        form={form}
        onForm={setForm}
        types={aiTypes}
        onSave={() => void save()}
      />

      {/* 类型管理：全部类型（含播种的内置 7 类）都可删、可改名 */}
      <TypeManagerDialog
        open={typeMgrOpen}
        onClose={() => {
          setTypeMgrOpen(false)
          setRenaming(null)
        }}
        types={aiTypes}
        countOf={countOf}
        renaming={renaming}
        renameDraft={renameDraft}
        draft={typeDraft}
        onStartRename={(t) => {
          setRenaming(t)
          setRenameDraft(t)
        }}
        onRenameDraft={setRenameDraft}
        onConfirmRename={(t) => void renameAiType(t)}
        onCancelRename={() => setRenaming(null)}
        onRemove={removeAiType}
        onDraft={setTypeDraft}
        onAdd={() => void addAiType()}
      />
    </div>
  )
}
