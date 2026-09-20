/**
 * 藏 —— 统一个人收藏系统
 *
 * 两套并存的维度，别混：
 *  · 「类型」= 介质（小说/动漫/游戏/GitHub…，items 上的 type 字段），固定枚举；
 *  · 「分类」= 你自建的主题标签（items 上的 category 字段），走 categories 业务表可增删、跨设备同步。
 *  两者默认名高度重合，界面上统一加「类型 · 」「分类 · 」前缀区分。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：列表卡 / 表单弹窗 / 详情抽屉 / AI 整理预览 /
 * 分类管理 / 筛选行各自成文件放在 ./collection/ 下；本文件只留状态、数据流与区块组合。
 */
import { useMemo, useState } from 'react'
import { Plus, Search, Star } from 'lucide-react'
import { useCollectionStore } from '../stores/useCollectionStore'
import { addCategory, categoryNames, removeCategory, resetCategories, useCategoryStore } from '../stores/useCategoryStore'
import { ProjectList } from './collection/ProjectList'
import { aiService } from '../services/ai/ai-service'
import { recordActivity } from '../services/activity'
import { playSound } from '../services/sound'
import type { CollectionItem } from '../types/entities'
import { createId, nowISO } from '../utils/id'
import { cn } from '../utils/cn'
import { Button, EmptyState, Input, PageHeader, Section, useToast } from '../components/ui'
import { CategoryFilterRow } from './collection/CategoryFilterRow'
import { CollectionItemCard } from './collection/ItemCard'
import { CollectionFormDialog } from './collection/FormDialog'
import { ItemDetailSheet } from './collection/ItemDetailSheet'
import { TidyDialog } from './collection/TidyDialog'
import { CategoryManagerDialog } from './collection/CategoryManagerDialog'
import { EMPTY_FORM, type FormState, type TidySuggestion } from './collection/shared'

export function CollectionPage() {
  const items = useCollectionStore((s) => s.items)
  const collectionCategoryRows = useCategoryStore((s) => s.items)
  // 分类来自业务表（跨设备同步）；派生结果在组件体内算，避免 selector 生成新引用
  const collectionCategories = useMemo(
    () => categoryNames(collectionCategoryRows, 'collection'),
    [collectionCategoryRows],
  )
  const toast = useToast().toast
  const [view, setView] = useState<'items' | 'projects'>('items')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [onlyFav, setOnlyFav] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CollectionItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<CollectionItem | null>(null)
  const [tidy, setTidy] = useState<TidySuggestion | null>(null)
  const [tidyBusy, setTidyBusy] = useState(false)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  /** 分类管理弹层：与情页同交互（增/删/恢复默认），并显示各分类条目数 */
  const [catMgrOpen, setCatMgrOpen] = useState(false)
  const [catDraft, setCatDraft] = useState('')

  /**
   * 筛选只有一维：分类（用途，可增删同步）——「拿它做什么」。
   * 介质（type，固定枚举）不在筛选行出现：此前它与分类默认名高度重合
   * （如分类「小说」与类型「小说」），并排在筛选行会造成同名重复。
   * 介质仍作为卡片属性展示（左侧签条/徽标），表单里也可选。
   */
  const list = useMemo(() => {
    return items
      .filter((it) => {
        if (catFilter === 'all') return true
        if (catFilter === '其他') return !it.category || !collectionCategories.includes(it.category)
        return it.category === catFilter
      })
      .filter((it) => !onlyFav || it.favorite)
      .filter((it) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          it.title.toLowerCase().includes(q) ||
          it.tags.some((t) => t.toLowerCase().includes(q)) ||
          (it.category ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [items, catFilter, onlyFav, query, collectionCategories])

  const addCategoryName = (name: string) => {
    const t = name.trim()
    if (!t) return
    void addCategory('collection', t)
    setCatDraft('')
  }
  const removeCategoryName = (name: string) => {
    void removeCategory('collection', name)
    if (catFilter === name) setCatFilter('all')
  }

  const openNew = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, type: 'novel' })
    setFormOpen(true)
  }
  const openEdit = (it: CollectionItem) => {
    setEditing(it)
    setForm({
      title: it.title,
      type: it.type,
      category: it.category ?? '',
      tags: it.tags.join(' '),
      url: it.url ?? '',
      description: it.description ?? '',
      rating: it.rating != null ? String(it.rating) : '',
      status: it.status ?? '',
      notes: it.notes ?? '',
    })
    setFormOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) return
    const now = nowISO()
    const item: CollectionItem = {
      id: editing?.id ?? createId(),
      title: form.title.trim(),
      type: form.type,
      // 编辑时允许清空分类：留空即无分类，不再回落到原值（已有分类永远无法取消是缺陷）
      category: form.category.trim() || undefined,
      tags: form.tags.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean),
      url: form.url.trim() || undefined,
      description: form.description.trim() || undefined,
      rating: form.rating ? Number(form.rating) : undefined,
      status: form.status.trim() || undefined,
      notes: form.notes.trim() || undefined,
      favorite: editing?.favorite ?? false,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    }
    await useCollectionStore.getState().save(item)
    setFormOpen(false)
    toast(editing ? '收藏已更新' : '已收藏', 'success')
    if (!editing) {
      void recordActivity({ entityType: 'collection', entityId: item.id, title: `收藏：${item.title.slice(0, 30)}` })
    }
  }

  const toggleFav = async (it: CollectionItem) => {
    await useCollectionStore.getState().update(it.id, { favorite: !it.favorite })
  }
  const remove = async (it: CollectionItem) => {
    await useCollectionStore.getState().remove(it.id)
    setDetail(null)
    toast('已删除')
  }

  /** AI 整理：生成建议 → 预览 → 确认后才写入 */
  const runTidy = async (it: CollectionItem) => {
    setTidyBusy(true)
    playSound('ui-open')
    try {
      const s = await aiService.analyzeCollection({
        title: it.title,
        type: it.type,
        category: it.category,
        tags: it.tags,
      })
      setTidy(s)
      playSound('success')
    } catch {
      toast('AI 整理失败', 'danger')
    } finally {
      setTidyBusy(false)
    }
  }
  const applyTidy = async () => {
    if (!tidy || !detail) return
    const patch: Partial<CollectionItem> = {}
    if (tidy.description && tidy.description !== detail.description) patch.description = tidy.description
    if (tidy.category && tidy.category !== (detail.category ?? '')) patch.category = tidy.category
    const mergedTags = [...new Set([...detail.tags, ...tidy.tags])]
    if (mergedTags.join('|') !== detail.tags.join('|')) patch.tags = mergedTags
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = nowISO()
      await useCollectionStore.getState().update(detail.id, patch)
      playSound('seal')
      toast('已应用 AI 整理', 'success')
    } else {
      toast('无需变更', 'info')
    }
    setTidy(null)
  }

  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="腹有诗书气自华" title="藏 · 典藏" />
      {/* 藏品 / 项目 切换 */}
      <div className="mb-4 switch-pill flex gap-1 rounded-tile p-0.5 w-fit">
        {([
          { key: 'items', label: '藏品' },
          { key: 'projects', label: '项目中心' },
        ] as const).map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={cn(
              'rounded-control px-4 py-1.5 text-sm transition-colors',
              view === v.key ? 'switch-pill-active' : 'text-ink-muted',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'projects' ? (
        <ProjectList />
      ) : (
        <>
          <Section
            title="藏品"
            hint={`${list.length} 件`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <Input
                    placeholder="搜索"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="!w-28 !py-1.5 !pl-8 text-sm sm:!w-48"
                  />
                </div>
                <button
                  onClick={() => setOnlyFav((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 rounded-tile px-2.5 py-1.5 text-sm transition-colors',
                    onlyFav ? 'bg-bronze/15 text-bronze' : 'bg-raised text-ink-muted hover:text-ink',
                  )}
                >
                  <Star size={13} /> 仅收藏
                </button>
                <Button size="sm" variant="primary" onClick={openNew}>
                  <Plus size={14} /> 收藏
                </Button>
              </div>
            }
          >
            {/* 筛选单行：全部 / 分类（可增删同步）/ 行尾「管理分类＋」。
                空数据也保留「＋」入口 —— 否则要先有一条藏品才能建分类（鸡生蛋） */}
            <CategoryFilterRow
              value={catFilter}
              onChange={setCatFilter}
              categories={collectionCategories}
              onManage={() => setCatMgrOpen(true)}
            />
            {list.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {list.map((it) => (
                  <CollectionItemCard
                    key={it.id}
                    it={it}
                    onOpen={() => setDetail(it)}
                    onToggleFav={() => void toggleFav(it)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="还没有藏品"
                desc="收藏小说、动漫、游戏、GitHub 项目、UI 参考…"
                action={
                  <Button variant="primary" onClick={openNew}>
                    <Plus size={14} /> 添加第一件
                  </Button>
                }
              />
            )}
          </Section>

          {/* 编辑弹窗 */}
          <CollectionFormDialog
            open={formOpen}
            onClose={() => setFormOpen(false)}
            editing={editing}
            form={form}
            onForm={setForm}
            categories={collectionCategories}
            onSave={() => void save()}
          />

          {/* 详情面板 */}
          <ItemDetailSheet
            detail={detail}
            onClose={() => setDetail(null)}
            tidyBusy={tidyBusy}
            onTidy={(it) => void runTidy(it)}
            onRemove={(it) => void remove(it)}
            onEdit={(it) => {
              setDetail(null)
              openEdit(it)
            }}
          />

          {/* AI 整理预览 → 确认 */}
          <TidyDialog tidy={tidy} onClose={() => setTidy(null)} onApply={() => void applyTidy()} />

          {/* 分类管理：与情页同交互（增/删/恢复默认），附各分类条目数 */}
          <CategoryManagerDialog
            open={catMgrOpen}
            onClose={() => setCatMgrOpen(false)}
            categories={collectionCategories}
            items={items}
            draft={catDraft}
            onDraft={setCatDraft}
            onAdd={() => addCategoryName(catDraft)}
            onRemove={removeCategoryName}
            onReset={() => {
              void resetCategories('collection')
              setCatFilter('all')
            }}
          />
        </>
      )}
    </div>
  )
}
