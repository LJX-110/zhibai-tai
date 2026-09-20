/**
 * 情 —— Intelligence Feed（信息流，非后台列表）
 * 顶部聚合页签 → 搜索/筛选 → 纵向信息流
 * 每条：标题 / 摘要 / 来源 / 分类 / 时间 / 标签；操作仅保留 收藏·稍后·更多，其余进 Inspector
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：本文件只留「状态 + 数据流 + 区块组合」，
 * 行 / 页签 / 筛选条 / 失败报告 / 关注面板 / 分类弹层各自成文件放在 ./intelligence/ 下，
 * 依赖一律**显式传参**，不再依赖组件内的闭包 —— 这正是上一轮"抽子组件"失败的原因。
 */
import { useMemo, useState } from 'react'
import { RefreshCw, Rss } from 'lucide-react'
import { useIntelligenceStore } from '../stores/useIntelligenceStore'
import { useSourceStore } from '../stores/useSourceStore'
import { addCategory, categoryNames, removeCategory, resetCategories, useCategoryStore } from '../stores/useCategoryStore'
import { useFollowStore } from '../stores/useLifeStores'
import { refreshAll, retrySource } from '../services/intelligence/run'
import { playSound } from '../services/sound'
import { useInspectorStore } from '../components/inspector/Inspector'
import { IntelTidy } from '../components/intelligence/IntelTidy'
import type { IntelligenceItem, SourceType } from '../types/entities'
import { diffDays } from '../utils/id'
import { cn } from '../utils/cn'
import { Button, EmptyState, PageHeader, useToast } from '../components/ui'
import { FeedMediaRow, FeedRow } from './intelligence/Feed'
import { FetchReportPanel } from './intelligence/FetchReportPanel'
import { FeedTabs } from './intelligence/FeedTabs'
import { FilterBar } from './intelligence/FilterBar'
import { FollowPanel } from './intelligence/FollowPanel'
import { CategoryDialog } from './intelligence/CategoryDialog'
import { PAGE_SIZE, type FetchReport } from './intelligence/shared'

export function IntelligencePage() {
  const items = useIntelligenceStore((s) => s.items)
  const follows = useFollowStore((s) => s.items)
  const intelCategoryRows = useCategoryStore((s) => s.items)
  // 分类来自业务表（跨设备同步）；派生结果在组件体内算，避免 selector 生成新引用
  const intelCategories = useMemo(() => categoryNames(intelCategoryRows, 'intel'), [intelCategoryRows])
  const toast = useToast().toast
  const [tab, setTab] = useState('全部')
  const [category, setCategory] = useState('全部')
  const [sourceType, setSourceType] = useState<SourceType | 'all'>('all')
  const [time, setTime] = useState('all')
  const [onlyFav, setOnlyFav] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [query, setQuery] = useState('')
  /** 进阶筛选（来源/时间/收藏/未读）默认折叠：手机首屏只保留搜索+分类 */
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE)
  /** 最近一次抓取的结果：失败源要留在界面上，而不是只在 toast 里闪一下 */
  const [fetchReport, setFetchReport] = useState<FetchReport | null>(null)
  /** 正在单独重试的源 id：让用户看清「在重试哪一个」，而不是整个页面进入 loading */
  const [retryingId, setRetryingId] = useState<string | null>(null)
  /** 分类管理弹层：分类在使用的页签处就地增删（不再放设置页） */
  const [catMgrOpen, setCatMgrOpen] = useState(false)
  const [catDraft, setCatDraft] = useState('')

  const addCategoryName = (name: string) => {
    const t = name.trim()
    if (!t) return
    void addCategory('intel', t)
    setCatDraft('')
  }
  const removeCategoryName = (name: string) => {
    void removeCategory('intel', name)
    // 被删的正是当前页签时回到「全部」，避免停留在一个已消失的筛选上
    if (tab === name) setTab('全部')
  }

  /** 聚合页签（自定义分类可增删） */
  const feedTabs = useMemo(() => ['全部', '关注', ...intelCategories, '其他'], [intelCategories])
  /** 分类筛选下拉（结构项：全部 / 自定义） */
  const catOptions = useMemo(() => ['全部', ...intelCategories, '自定义'], [intelCategories])

  const fetchIntelligence = async () => {
    setLoading(true)
    try {
      // 拉取、去重、落库、退避全在 refreshAll 里：情报页 / 命令面板 / 定时器
      // 共用同一条链路，不会出现「这个入口会退避、那个入口不会」的漂移
      const res = await refreshAll()

      // 失败原因必须留在界面上：以前失败被丢在 Promise.allSettled 里，
      // 用户只看得到「拉取 0 条」，无从判断是没配代理还是被限流
      setFetchReport({ added: res.added, failures: res.failures, skipped: res.skipped })
      if (res.added > 0) playSound('intel-new')
      // 全部成功不弹 toast：页内报告已展示新增数，避免频繁打断（更克制的通知策略）
      if (res.failures.length > 0) {
        toast(
          `新增 ${res.added} 条 · ${res.failures.length} 个源失败`,
          res.items.length === 0 ? 'danger' : 'info',
        )
      }
    } catch (e) {
      toast(`拉取失败：${e instanceof Error ? e.message : '未知错误'}`, 'danger')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 单源重试：只重打这一个源。
   * 整轮重试会让已经正常的源再次被请求 —— 那正是限流的来源，
   * 所以失败报告里给出的入口必须是「只重试坏的这一个」。
   */
  const retryOne = async (sourceId: string) => {
    const source = useSourceStore.getState().items.find((s) => s.id === sourceId)
    if (!source) {
      toast('该情报源已被删除', 'danger')
      setFetchReport((prev) => (prev ? { ...prev, failures: prev.failures.filter((f) => f.sourceId !== sourceId) } : prev))
      return
    }
    setRetryingId(sourceId)
    try {
      const res = await retrySource(source)
      if (res.failure) {
        // 更新为最新一次的错误，而不是留着上一次的旧文案
        setFetchReport((prev) =>
          prev
            ? { ...prev, failures: prev.failures.map((f) => (f.sourceId === sourceId ? res.failure! : f)) }
            : prev,
        )
        toast(`重试「${source.name}」仍失败：${res.failure.message}`, 'danger')
      } else {
        setFetchReport((prev) =>
          prev
            ? {
                ...prev,
                added: prev.added + res.added,
                failures: prev.failures.filter((f) => f.sourceId !== sourceId),
              }
            : prev,
        )
        toast(`重试「${source.name}」成功：新增 ${res.added} 条`, res.added > 0 ? 'success' : 'info')
      }
    } catch (e) {
      toast(`重试失败：${e instanceof Error ? e.message : '未知错误'}`, 'danger')
    } finally {
      setRetryingId(null)
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

  /**
   * 增量渲染：情报最多保留 500 条，一次性铺开会让手机端首屏渲染很重
   * （每条都可能带缩略图）。筛选条件一变就回到第一页。
   *
   * 用渲染期守卫而不是 useEffect：effect 里同步 setState 会多一轮级联渲染
   * （也是 oxlint 的 set-state-in-effect 规则所指的问题），
   * 而这个仓库已有同类写法（如 NoteEditor 的表单重置）。
   */
  const filterKey = `${tab}|${sourceType}|${category}|${time}|${onlyFav}|${onlyUnread}|${query}`
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setPageLimit(PAGE_SIZE)
  }
  const visible = useMemo(() => list.slice(0, pageLimit), [list, pageLimit])
  /** 任一筛选生效即视为"有明确意图" */
  const filtersActive =
    tab !== '全部' ||
    sourceType !== 'all' ||
    category !== '全部' ||
    time !== 'all' ||
    onlyFav ||
    onlyUnread ||
    query.trim() !== ''

  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      {/* 页头：与其它板块统一（PageHeader 含符箓/题跋动效） */}
      <PageHeader
        title="情 · 汇流"
        poem="世事洞明皆学问"
        action={
          <div className="flex items-center gap-2">
            <IntelTidy />
            <Button variant="primary" size="sm" onClick={fetchIntelligence} disabled={loading}>
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
              {loading ? '拉取中…' : '拉取情报'}
            </Button>
          </div>
        }
      />

      {fetchReport && (
        <FetchReportPanel
          report={fetchReport}
          retryingId={retryingId}
          onRetry={(id) => void retryOne(id)}
          onDismiss={() => setFetchReport(null)}
        />
      )}

      <FeedTabs tabs={feedTabs} active={tab} onChange={setTab} onManage={() => setCatMgrOpen(true)} />

      <FilterBar
        query={query}
        onQuery={setQuery}
        category={category}
        onCategory={setCategory}
        catOptions={catOptions}
        moreOpen={moreFiltersOpen}
        onToggleMore={() => setMoreFiltersOpen((v) => !v)}
        sourceType={sourceType}
        onSourceType={setSourceType}
        time={time}
        onTime={setTime}
        onlyFav={onlyFav}
        onToggleFav={() => setOnlyFav((v) => !v)}
        onlyUnread={onlyUnread}
        onToggleUnread={() => setOnlyUnread((v) => !v)}
        filtersActive={filtersActive}
        count={list.length}
        mediaCount={mediaCount}
      />

      {tab === '关注' && (
        <FollowPanel
          follows={follows}
          onRemove={(f) => {
            void useFollowStore.getState().remove(f.id)
            toast(`已取消关注「${f.keyword}」`)
          }}
        />
      )}

      {/* 信息流 */}
      {list.length > 0 ? (
        <>
          <div className="space-y-1.5">
            {visible.map((it) =>
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
          {list.length > visible.length && (
            <Button
              variant="tertiary"
              className="mt-3 w-full"
              onClick={() => setPageLimit((n) => n + PAGE_SIZE)}
            >
              加载更多（{visible.length} / {list.length}）
            </Button>
          )}
        </>
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
      <CategoryDialog
        open={catMgrOpen}
        onClose={() => setCatMgrOpen(false)}
        categories={intelCategories}
        draft={catDraft}
        onDraft={setCatDraft}
        onAdd={() => addCategoryName(catDraft)}
        onRemove={removeCategoryName}
        onReset={() => {
          void resetCategories('intel')
          setTab('全部')
        }}
      />
    </div>
  )
}
