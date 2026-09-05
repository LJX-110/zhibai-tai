/**
 * 情 —— Intelligence Feed（信息流，非后台列表）
 * 顶部聚合页签 → 搜索/筛选 → 纵向信息流
 * 每条：标题 / 摘要 / 来源 / 分类 / 时间 / 标签；操作仅保留 收藏·稍后·更多，其余进 Inspector
 */
import { useMemo, useState } from 'react'
import { Bookmark, Clock, Languages, MoreHorizontal, Plus, RefreshCw, Rss, Settings2, Sparkles, Trash2 } from 'lucide-react'
import { useIntelligenceStore } from '../stores/useIntelligenceStore'
import { useSourceStore } from '../stores/useSourceStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useFollowStore } from '../stores/useLifeStores'
import { dedupeKey } from '../components/source/SourceManager'
import {
  fetchAllFromSources,
  fetchFromSource,
} from '../services/intelligence/providers/registry'
import { aiService } from '../services/ai/ai-service'
import { useInspectorStore } from '../components/inspector/Inspector'
import { IntelTidy } from '../components/intelligence/IntelTidy'
import type { IntelligenceItem, SourceType } from '../types/entities'
import { diffDays, formatHM, friendlyDate } from '../utils/id'
import { cn } from '../utils/cn'
import { Badge, Button, Dialog, EmptyState, Input, Select, Tooltip, useToast } from '../components/ui'
const SOURCE_OPTIONS: { value: SourceType | 'all'; label: string }[] = [
  { value: 'all', label: '全部来源' },
  { value: 'github', label: 'GitHub' },
  { value: 'rss', label: 'RSS' },
  { value: 'official', label: '官方' },
  { value: 'web', label: 'Web' },
  { value: 'game', label: '游戏' },
  { value: 'anime', label: '动漫' },
]

const TIME_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: '3d', label: '近 3 天' },
  { value: '7d', label: '近 7 天' },
]

/** 单条情报 AI 中文摘要（可折叠；外文标题/摘要 → 中文概括） */
function FeedTranslate({ it }: { it: IntelligenceItem }) {
  const [zh, setZh] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast().toast
  const toggle = async () => {
    if (zh) {
      setZh(null)
      return
    }
    setLoading(true)
    try {
      setZh(await aiService.translateSummary(it))
    } catch {
      toast('AI 摘要失败', 'danger')
    } finally {
      setLoading(false)
    }
  }
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          void toggle()
        }}
        className={cn(
          'flex items-center gap-1 rounded-control px-1.5 py-1 text-[11px] transition-colors',
          zh ? 'text-teal' : 'text-ink-faint hover:text-teal',
        )}
      >
        <Languages size={12} /> {loading ? '…' : zh ? '收起' : '中文摘要'}
      </button>
      {zh && (
        <p className="mt-1 line-clamp-6 whitespace-pre-wrap rounded-[6px] border border-teal/20 bg-teal/5 px-2 py-1.5 text-[12px] leading-relaxed text-ink-soft">
          {zh}
        </p>
      )}
    </>
  )
}

/** 媒体行（游戏/动漫等带图情报） */
function FeedMediaRow({
  it,
  onOpen,
  onFav,
  onLater,
}: {
  it: IntelligenceItem
  onOpen: () => void
  onFav: () => void
  onLater: () => void
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      className={cn(
        'group flex cursor-pointer items-start gap-3 rounded-tile border border-line bg-panel/60 px-3 py-3 transition-colors hover:border-line-strong',
        it.read && 'opacity-60',
      )}
    >
      {it.image ? (
        <img
          src={it.image}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-control border border-line object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-control border border-line bg-raised text-ink-faint">
          <Rss size={18} strokeWidth={1.5} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-ink">{it.title}</span>
          {!it.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar" />}
        </div>
        {it.summary && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{it.summary}</p>
        )}
        <FeedMeta it={it} />
        <FeedTranslate it={it} />
      </div>
      <FeedActions it={it} onFav={onFav} onLater={onLater} onOpen={onOpen} />
    </div>
  )
}

/** 普通文本行 */
function FeedRow({
  it,
  onOpen,
  onFav,
  onLater,
}: {
  it: IntelligenceItem
  onOpen: () => void
  onFav: () => void
  onLater: () => void
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      className={cn(
        'group cursor-pointer items-start rounded-control px-3 py-2.5 transition-colors hover:bg-raised',
        it.read && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-ink">{it.title}</span>
        {!it.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar" />}
      </div>
      {it.summary && (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{it.summary}</p>
      )}
      <div className="mt-1 flex items-start justify-between gap-2">
        <FeedMeta it={it} />
        <FeedActions it={it} onFav={onFav} onLater={onLater} onOpen={onOpen} />
      </div>
      <FeedTranslate it={it} />
    </div>
  )
}

/** 元信息：来源 / 分类 / 时间 / 标签 */
function FeedMeta({ it }: { it: IntelligenceItem }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Badge tone={it.sourceType === 'github' || it.sourceType === 'game' ? 'teal' : it.sourceType === 'official' ? 'cinnabar' : 'plain'}>
        {it.source}
      </Badge>
      {it.category && <Badge tone="plain">{it.category}</Badge>}
      {it.publishedAt && (
        <span className="tabular text-[11px] text-ink-faint">
          {diffDays(it.publishedAt.slice(0, 10)) === 0
            ? `今天 ${formatHM(it.publishedAt)}`
            : friendlyDate(it.publishedAt.slice(0, 10))}
        </span>
      )}
      {it.tags.slice(0, 3).map((t) => (
        <span key={t} className="text-[11px] text-ink-faint">#{t}</span>
      ))}
    </div>
  )
}

/** 操作：收藏 / 稍后 / 更多（其余进 Inspector） */
function FeedActions({
  it,
  onFav,
  onLater,
  onOpen,
}: {
  it: IntelligenceItem
  onFav: () => void
  onLater: () => void
  onOpen: () => void
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Tooltip label={it.favorite ? '取消收藏' : '收藏'}>
        <button
          onClick={onFav}
          className="touch-target rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-bronze"
          aria-label="收藏"
        >
          <Bookmark size={15} fill={it.favorite ? 'currentColor' : 'none'} />
        </button>
      </Tooltip>
      <Tooltip label="稍后读">
        <button
          onClick={onLater}
          className="touch-target rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-ink"
          aria-label="稍后读"
        >
          <Clock size={15} />
        </button>
      </Tooltip>
      <Tooltip label="详情">
        <button
          onClick={onOpen}
          className="touch-target rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-ink"
          aria-label="更多"
        >
          <MoreHorizontal size={15} />
        </button>
      </Tooltip>
    </div>
  )
}

export function IntelligencePage() {
  const items = useIntelligenceStore((s) => s.items)
  const sources = useSourceStore((s) => s.items)
  const follows = useFollowStore((s) => s.items)
  const intelCategories = useSettingsStore((s) => s.intelCategories)
  const toast = useToast().toast
  const [provider, setProvider] = useState('all')
  const [tab, setTab] = useState('全部')
  const [category, setCategory] = useState('全部')
  const [sourceType, setSourceType] = useState<SourceType | 'all'>('all')
  const [time, setTime] = useState('all')
  const [onlyFav, setOnlyFav] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnswer, setAiAnswer] = useState<{ answer: string; sources: string[] } | null>(null)
  /** 分类管理弹层：分类在使用的页签处就地增删（不再放设置页） */
  const [catMgrOpen, setCatMgrOpen] = useState(false)
  const [catDraft, setCatDraft] = useState('')

  const addCategory = () => {
    const t = catDraft.trim()
    if (!t) return
    useSettingsStore.getState().addIntelCategory(t)
    setCatDraft('')
  }
  const removeCategory = (name: string) => {
    useSettingsStore.getState().removeIntelCategory(name)
    // 被删的正是当前页签时回到「全部」，避免停留在一个已消失的筛选上
    if (tab === name) setTab('全部')
  }

  /** AI 问情报：基于近期情报用中文回答用户问题 */
  const askAI = async () => {
    const q = aiQuery.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    try {
      const res = await aiService.queryIntelligence(q, items)
      setAiAnswer(res)
      toast('AI 已回答', 'success')
    } catch {
      toast('AI 问答失败', 'danger')
    } finally {
      setAiLoading(false)
    }
  }

  /** 聚合页签（自定义分类可增删） */
  const feedTabs = useMemo(() => ['全部', '关注', ...intelCategories, '其他'], [intelCategories])
  /** 分类筛选下拉（结构项：全部 / 自定义） */
  const catOptions = useMemo(() => ['全部', ...intelCategories, '自定义'], [intelCategories])

  const fetchIntelligence = async () => {
    setLoading(true)
    try {
      const sourceList = useSourceStore.getState().items
      const fresh =
        provider === 'all'
          ? await fetchAllFromSources(sourceList)
          : await fetchFromSource(sourceList.find((s) => s.id === provider) ?? sourceList[0])
      // 去重：source + externalId | url | title + date
      const known = new Set(useIntelligenceStore.getState().items.map((x) => dedupeKey(x)))
      const newItems = fresh.filter((x) => !known.has(dedupeKey(x)))
      // P0-C 修复：此前只 setState 内存态，刷新页面即丢失。
      // 现在 saveMany 一次性落库（时间戳由 repo 层补齐，参与同步）。
      const ok = await useIntelligenceStore.getState().saveMany(newItems)
      if (!ok) {
        toast('情报已拉取但保存失败，请检查存储空间', 'danger')
        return
      }
      toast(`拉取 ${fresh.length} 条情报（新增 ${newItems.length}）`, 'success')
    } catch {
      toast('拉取失败', 'danger')
    } finally {
      setLoading(false)
    }
  }

  const list = useMemo(() => {
    return items
      .filter((it) => {
        if (tab === '全部' || tab === '关注') return true
        const cat = it.category ?? ''
        // 「其他」聚合不在自定义列表中的全部情报（含无分类）
        if (tab === '其他') return !intelCategories.includes(cat)
        return cat === tab
      })
      .filter((it) => {
        if (tab !== '关注') return true
        // 关注流：命中任一关注关键词
        return follows.some((f) =>
          it.title.toLowerCase().includes(f.keyword.toLowerCase()) ||
          (it.tags ?? []).some((t) => t.toLowerCase().includes(f.keyword.toLowerCase())) ||
          (it.category ?? '').toLowerCase().includes(f.keyword.toLowerCase()) ||
          (it.source ?? '').toLowerCase().includes(f.keyword.toLowerCase()),
        )
      })
      .filter((it) => sourceType === 'all' || it.sourceType === sourceType)
      .filter((it) => category === '全部' || (it.category ?? '自定义') === category)
      .filter((it) => !onlyFav || it.favorite)
      .filter((it) => !onlyUnread || !it.read)
      .filter((it) => {
        if (time === 'all') return true
        const d = diffDays((it.publishedAt ?? it.createdAt).slice(0, 10))
        if (time === 'today') return d === 0
        if (time === '3d') return d >= 0 && d <= 3
        return d >= 0 && d <= 7
      })
      .filter((it) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (
          it.title.toLowerCase().includes(q) ||
          it.tags.some((t) => t.toLowerCase().includes(q)) ||
          (it.category ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
  }, [items, tab, follows, sourceType, category, onlyFav, onlyUnread, time, query, intelCategories])

  const openDetail = (it: IntelligenceItem) => {
    if (!it.read) void useIntelligenceStore.getState().update(it.id, { read: true })
    useInspectorStore.getState().open('intelligence', it.id)
  }
  const toggleFav = async (it: IntelligenceItem) => {
    await useIntelligenceStore.getState().update(it.id, { favorite: !it.favorite })
  }
  const markLater = async (it: IntelligenceItem) => {
    await useIntelligenceStore.getState().update(it.id, { read: false })
    toast('已加入稍后读', 'success')
  }

  const mediaCount = list.filter((it) => it.image).length

  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <h1 className="scribal-title text-3xl text-ink-bright">情报流</h1>
          <p className="scribal mt-1.5 text-base text-ink-muted">世事洞明皆学问</p>
        </div>
        <div className="flex items-center gap-2">
          <IntelTidy />
          <Button variant="primary" size="sm" onClick={fetchIntelligence} disabled={loading}>
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            {loading ? '拉取中…' : '拉取情报'}
          </Button>
        </div>
      </div>

      {/* 聚合页签（行尾 + 号就地管理分类） */}
      <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-1 overflow-x-auto px-1 pb-1">
        {feedTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'shrink-0 rounded-tile px-3.5 py-2 text-sm transition-colors',
              tab === t ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:bg-nested hover:text-ink',
            )}
          >
            {t}
          </button>
        ))}
        <Tooltip label="管理分类">
          <button
            onClick={() => setCatMgrOpen(true)}
            className="shrink-0 rounded-tile bg-raised p-2 text-ink-muted transition-colors hover:bg-nested hover:text-ink"
            aria-label="管理分类"
          >
            <Plus size={14} />
          </button>
        </Tooltip>
      </div>

      {/* 筛选条 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="搜索标题 / 标签"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="!w-40 !py-1.5 !pl-3 text-sm sm:!w-52"
        />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-auto !py-1.5 text-sm">
          {catOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as SourceType | 'all')}
          className="!w-auto !py-1.5 text-sm"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select value={time} onChange={(e) => setTime(e.target.value)} className="!w-auto !py-1.5 text-sm">
          {TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <button
          onClick={() => setOnlyFav((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded-tile px-2.5 py-2 text-sm transition-colors',
            onlyFav ? 'bg-bronze/15 text-bronze' : 'bg-raised text-ink-muted hover:text-ink',
          )}
        >
          <Bookmark size={13} /> 收藏
        </button>
        <button
          onClick={() => setOnlyUnread((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded-tile px-2.5 py-2 text-sm transition-colors',
            onlyUnread ? 'bg-teal/15 text-teal' : 'bg-raised text-ink-muted hover:text-ink',
          )}
        >
          未读
        </button>
        <span className="ml-auto hidden text-xs text-ink-faint sm:inline">
          {list.length} 条{mediaCount > 0 ? ` · ${mediaCount} 条含图` : ''}
        </span>
      </div>

      {/* AI 问情报 */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Sparkles size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-bronze" />
            <Input
              placeholder="用 AI 问情报，例如：最近有什么 AI 模型新进展？"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askAI()}
              className="!pl-8"
            />
          </div>
          <Button variant="ritual" size="md" onClick={askAI} disabled={aiLoading || !aiQuery.trim()}>
            {aiLoading ? '思考中…' : '问 AI'}
          </Button>
        </div>
        {aiAnswer && (
          <div className="mt-2 rounded-tile border border-teal/25 bg-teal/5 p-3">
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
              {aiAnswer.answer}
            </pre>
            {aiAnswer.sources.length > 0 && (
              <div className="mt-2 border-t border-line/60 pt-2 text-[11px] text-ink-faint">
                来源：{aiAnswer.sources.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 信息流 */}
      {list.length > 0 ? (
        <div className="space-y-1.5">
          {list.map((it) =>
            it.image ? (
              <FeedMediaRow
                key={it.id}
                it={it}
                onOpen={() => openDetail(it)}
                onFav={() => toggleFav(it)}
                onLater={() => markLater(it)}
              />
            ) : (
              <FeedRow
                key={it.id}
                it={it}
                onOpen={() => openDetail(it)}
                onFav={() => toggleFav(it)}
                onLater={() => markLater(it)}
              />
            ),
          )}
        </div>
      ) : (
        <div className="rounded-paper border border-line bg-raised">
          <EmptyState
            icon={Rss}
            title={items.length === 0 ? '今日尚无情报' : '没有符合筛选的情报'}
            desc={items.length === 0 ? '来源已就绪，拉取后在此汇总' : '调整筛选条件再试'}
            action={
              items.length === 0 ? (
                <Button variant="primary" onClick={fetchIntelligence} disabled={loading}>
                  <RefreshCw size={13} className={cn(loading && 'animate-spin')} /> 拉取情报
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* 分类管理：就地增删（移除不影响已有情报，仅收起页签） */}
      <Dialog open={catMgrOpen} onClose={() => setCatMgrOpen(false)} title="管理情报分类">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {intelCategories.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink-soft"
              >
                {c}
                <button
                  onClick={() => removeCategory(c)}
                  className="text-ink-faint transition-colors hover:text-cinnabar"
                  aria-label={`移除 ${c}`}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
            {intelCategories.length === 0 && (
              <span className="text-xs text-ink-faint">暂无自定义分类，情报将全部归入「其他」</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={catDraft}
              onChange={(e) => setCatDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              placeholder="新增分类名…"
              className="max-w-[200px]"
            />
            <Button size="sm" variant="secondary" onClick={addCategory} disabled={!catDraft.trim()}>
              <Plus size={13} /> 添加
            </Button>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <p className="text-[11px] text-ink-faint">新增后可作为情报源的分类与筛选页签</p>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => {
                useSettingsStore.getState().resetIntelCategories()
                setTab('全部')
              }}
            >
              <Settings2 size={13} /> 恢复默认
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 来源快捷入口 */}
      {sources.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-2 text-[11px] tracking-[0.24em] text-ink-faint">情报源 · SOURCES</div>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setProvider('all')}
              className={cn(
                'shrink-0 rounded-tile border px-3 py-1.5 text-sm transition-colors',
                provider === 'all'
                  ? 'border-cinnabar/40 bg-cinnabar/5 text-cinnabar'
                  : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              全部源
            </button>
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => setProvider(s.id)}
                className={cn(
                  'shrink-0 rounded-tile border px-3 py-1.5 text-sm transition-colors',
                  provider === s.id
                    ? 'border-cinnabar/40 bg-cinnabar/5 text-cinnabar'
                    : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {s.name}
                {!s.enabled && <span className="ml-1 text-[10px] opacity-60">停</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
