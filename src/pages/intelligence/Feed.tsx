/**
 * 情 · 信息流的行与行内零件
 * 只依赖显式 props（it + 三个回调），不读任何 store —— 保证可以独立渲染、独立复用。
 */
import { useState } from 'react'
import { Bookmark, Clock, Languages, MoreHorizontal, Rss } from 'lucide-react'
import { aiService } from '../../services/ai/ai-service'
import type { IntelligenceItem } from '../../types/entities'
import { diffDays, formatHM, friendlyDate } from '../../utils/id'
import { cn } from '../../utils/cn'
import { Badge, Tooltip, useToast } from '../../components/ui'
import { rowKeyDown } from './shared'

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
          'flex items-center gap-1 rounded-control px-1.5 py-1 text-xs transition-colors',
          zh ? 'text-teal' : 'text-ink-faint hover:text-teal',
        )}
      >
        <Languages size={12} /> {loading ? '…' : zh ? '收起' : '中文摘要'}
      </button>
      {zh && (
        <p className="mt-1 line-clamp-6 whitespace-pre-wrap rounded-tile border border-teal/20 bg-teal/5 px-2 py-1.5 text-xs leading-relaxed text-ink-soft">
          {zh}
        </p>
      )}
    </>
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
        <span className="tabular text-xs text-ink-faint">
          {diffDays(it.publishedAt.slice(0, 10)) === 0
            ? `今天 ${formatHM(it.publishedAt)}`
            : friendlyDate(it.publishedAt.slice(0, 10))}
        </span>
      )}
      {it.tags.slice(0, 3).map((t) => (
        <span key={t} className="text-xs text-ink-faint">#{t}</span>
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
      <Tooltip label="详情 · 可删除">
        <button
          onClick={onOpen}
          className="touch-target rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-ink"
          aria-label="详情"
        >
          <MoreHorizontal size={15} />
        </button>
      </Tooltip>
    </div>
  )
}

/** 媒体行（游戏/动漫等带图情报） */
export function FeedMediaRow({
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
      onKeyDown={rowKeyDown(onOpen)}
      role="button"
      tabIndex={0}
      className={cn(
        'group flex cursor-pointer items-start gap-3 rounded-tile border border-line bg-paper/50 px-3 py-3 transition-colors hover:border-line-strong active:bg-nested',
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
          <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">{it.summary}</p>
        )}
        <FeedMeta it={it} />
        <FeedTranslate it={it} />
      </div>
      <FeedActions it={it} onFav={onFav} onLater={onLater} onOpen={onOpen} />
    </div>
  )
}

/** 普通文本行 */
export function FeedRow({
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
      onKeyDown={rowKeyDown(onOpen)}
      role="button"
      tabIndex={0}
      className={cn(
        'group cursor-pointer items-start rounded-control px-3 py-2.5 transition-colors hover:bg-raised active:bg-nested',
        it.read && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1.5">
        {/* min-w-0 + break-words：GitHub / 英文标题常有超长无空格词，
            不加这两项会把整行撑破（父容器是 flex，默认 min-width:auto） */}
        <span className="min-w-0 break-words text-sm font-medium text-ink">{it.title}</span>
        {!it.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cinnabar" />}
      </div>
      {it.summary && (
        <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">{it.summary}</p>
      )}
      <div className="mt-1 flex items-start justify-between gap-2">
        {/* 元信息包一层 min-w-0 flex-1：来源 Badge 是 nowrap，不约束的话
            会把右侧操作按钮挤出屏幕 */}
        <div className="min-w-0 flex-1">
          <FeedMeta it={it} />
        </div>
        <FeedActions it={it} onFav={onFav} onLater={onLater} onOpen={onOpen} />
      </div>
      <FeedTranslate it={it} />
    </div>
  )
}
