/**
 * 藏 —— 统一个人收藏系统
 * 类型：小说/动漫/游戏/影视/书籍/GitHub/项目/UI参考/灵感/自定义
 */
import { useMemo, useState } from 'react'
import { Plus, Search, Star, Pencil, Trash2, ExternalLink, Sparkles } from 'lucide-react'
import { useCollectionStore } from '../stores/useCollectionStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { ProjectList } from '../components/project/ProjectList'
import { aiService } from '../services/ai/ai-service'
import { recordActivity } from '../services/activity'
import { playSound } from '../services/sound'
import type { CollectionItem, CollectionType } from '../types/entities'
import { createId } from '../utils/id'
import { cn } from '../utils/cn'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Section,
  Select,
  Textarea,
  Sheet,
  useToast,
} from '../components/ui'

const TYPE_LABEL: Record<CollectionType, string> = {
  novel: '小说',
  anime: '动漫',
  game: '游戏',
  film: '影视',
  book: '书籍',
  github: 'GitHub',
  project: '项目',
  ui_ref: 'UI 参考',
  inspiration: '灵感',
  custom: '自定义',
}

const TYPE_ORDER: CollectionType[] = [
  'novel',
  'anime',
  'game',
  'film',
  'book',
  'github',
  'project',
  'ui_ref',
  'inspiration',
  'custom',
]

interface FormState {
  title: string
  type: CollectionType
  category: string
  tags: string
  url: string
  description: string
  rating: string
  status: string
  notes: string
}

const EMPTY_FORM: FormState = {
  title: '',
  type: 'novel',
  category: '',
  tags: '',
  url: '',
  description: '',
  rating: '',
  status: '',
  notes: '',
}

export function CollectionPage() {
  const items = useCollectionStore((s) => s.items)
  const collectionCategories = useSettingsStore((s) => s.collectionCategories)
  const toast = useToast().toast
  const [view, setView] = useState<'items' | 'projects'>('items')
  const [typeFilter, setTypeFilter] = useState<CollectionType | 'all'>('all')
  const [onlyFav, setOnlyFav] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<CollectionItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<CollectionItem | null>(null)
  const [tidy, setTidy] = useState<{ description: string; tags: string[]; category: string; reason: string } | null>(null)
  const [tidyBusy, setTidyBusy] = useState(false)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })

  const list = useMemo(() => {
    return items
      .filter((it) => typeFilter === 'all' || it.type === typeFilter)
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
  }, [items, typeFilter, onlyFav, query])

  const openNew = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, type: typeFilter === 'all' ? 'novel' : typeFilter })
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
    const now = new Date().toISOString()
    const item: CollectionItem = {
      id: editing?.id ?? createId(),
      title: form.title.trim(),
      type: form.type,
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
      patch.updatedAt = new Date().toISOString()
      await useCollectionStore.getState().update(detail.id, patch)
      playSound('seal')
      toast('已应用 AI 整理', 'success')
    } else {
      toast('无需变更', 'info')
    }
    setTidy(null)
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="腹有诗书气自华" title="藏 · 典藏" />
      {/* 藏品 / 项目 切换 */}
      <div className="mb-4 flex gap-1 rounded-tile bg-nested/50 p-0.5 w-fit">
        {([
          { key: 'items', label: '藏品' },
          { key: 'projects', label: '项目中心' },
        ] as const).map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={cn(
              'rounded-control px-4 py-1.5 text-sm transition-colors',
              view === v.key ? 'bg-paper text-ink shadow-soft' : 'text-ink-muted',
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
      {/* 筛选条 */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              'rounded-tile px-3 py-1.5 text-sm transition-colors',
              typeFilter === 'all' ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
            )}
          >
            全部 <span className="tabular text-xs opacity-60">{items.length}</span>
          </button>
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'rounded-tile px-3 py-1.5 text-sm transition-colors',
                typeFilter === t ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
              )}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

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
        {list.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {list.map((it) => (
              <div
                key={it.id}
                onClick={() => setDetail(it)}
                className="group relative flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-tile border border-line bg-raised transition-all duration-fast hover:-translate-y-0.5 hover:shadow-soft"
              >
                {/* 左侧类型签条（与记事本同语言） */}
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 w-[3px]',
                    it.type === 'github'
                      ? 'bg-teal/60'
                      : it.type === 'project'
                        ? 'bg-cinnabar/55'
                        : 'bg-gold-btn/70',
                  )}
                />
                <div className="flex flex-1 flex-col p-3 pl-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-ink-muted">{TYPE_LABEL[it.type]}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFav(it)
                      }}
                      className={cn(
                        'rounded-[4px] p-1.5 transition-colors',
                        it.favorite ? 'text-bronze' : 'text-ink-faint hover:text-bronze',
                      )}
                      aria-label="收藏"
                    >
                      <Star size={15} fill={it.favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {/* 标题区：居中书法大字 */}
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-1 text-center">
                    <span className="scribal-title line-clamp-2 text-xl leading-snug text-ink">
                      {it.title}
                    </span>
                    {it.category && (
                      <span className="text-[11px] text-ink-muted">{it.category}</span>
                    )}
                  </div>
                  {/* 底部：状态/标签/评级 */}
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-t border-line/70 pt-2">
                    {it.status && <Badge tone="plain">{it.status}</Badge>}
                    {it.tags.slice(0, 2).map((t) => (
                      <span key={t} className="text-[11px] text-ink-faint">#{t}</span>
                    ))}
                    {it.rating != null && (
                      <span className="tabular text-[11px] text-bronze">
                        {'★'.repeat(it.rating)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
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
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? '改藏品' : '新藏品'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setFormOpen(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={!form.title.trim()}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CollectionType })}>
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </Select>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="分类">
              <option value="">不分类</option>
              {collectionCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="#标签" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            <Input placeholder="评分 0-5" type="number" min={0} max={5} step={0.5} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
          </div>
          <Input placeholder="URL（可选）" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <Input placeholder="状态（如：在读/追更/已完）" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <Textarea placeholder="简介（可选）" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Textarea placeholder="备注（可选）" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Dialog>

      {/* 详情面板 */}
      <Sheet open={detail != null} onClose={() => setDetail(null)} title={detail?.title}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="cinnabar">{TYPE_LABEL[detail.type]}</Badge>
              {detail.category && <Badge tone="teal">{detail.category}</Badge>}
              {detail.status && <Badge>{detail.status}</Badge>}
              {detail.rating != null && (
                <span className="tabular text-sm text-bronze">{'★'.repeat(detail.rating)}</span>
              )}
            </div>
            {detail.description && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{detail.description}</p>
            )}
            {detail.notes && (
              <div className="rounded-paper bg-raised p-3">
                <p className="mb-1 text-xs text-ink-faint">备注</p>
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{detail.notes}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {detail.tags.map((t) => (
                <span key={t} className="text-xs text-ink-faint">#{t}</span>
              ))}
            </div>
            {detail.url && (
              <a
                href={detail.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-teal link-underline"
              >
                <ExternalLink size={14} /> 打开链接
              </a>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="secondary" onClick={() => runTidy(detail)} disabled={tidyBusy}>
                <Sparkles size={13} /> {tidyBusy ? '整理中…' : 'AI 整理'}
              </Button>
              <Button variant="danger" onClick={() => remove(detail)}>
                <Trash2 size={14} /> 删除
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setDetail(null)
                  openEdit(detail)
                }}
              >
                <Pencil size={14} /> 编辑
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* AI 整理预览 → 确认 */}
      <Dialog
        open={tidy != null}
        onClose={() => setTidy(null)}
        title="AI 整理 · 预览"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setTidy(null)}>取消</Button>
            <Button variant="primary" onClick={applyTidy}>确认应用</Button>
          </>
        }
      >
        {tidy && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[11px] text-ink-faint">简介</div>
              <p className="rounded-tile border border-line px-3 py-2 text-sm text-ink-soft">{tidy.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[11px] text-ink-faint">分类</div>
                <p className="rounded-tile border border-line px-3 py-2 text-sm text-ink">{tidy.category}</p>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-ink-faint">标签</div>
                <p className="rounded-tile border border-line px-3 py-2 text-sm text-ink">{tidy.tags.join('、')}</p>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-ink-faint">收藏原因</div>
              <p className="rounded-tile border border-line px-3 py-2 text-sm text-ink-muted">{tidy.reason}</p>
            </div>
            <p className="text-[11px] text-ink-faint">写入前请确认：AI 仅生成建议，可自行修改。</p>
          </div>
        )}
      </Dialog>
        </>
      )}
    </div>
  )
}
