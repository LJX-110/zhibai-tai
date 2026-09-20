/**
 * 情 · 筛选条
 * 手机上只留高频（搜索 + 分类），来源/时间/收藏/未读收进「筛选」折叠，
 * 避免 6 个控件挤在首屏（此前 375px 下一行塞满、换行后仍是三行小控件堆叠）。
 */
import { Bookmark, SlidersHorizontal } from 'lucide-react'
import type { SourceType } from '../../types/entities'
import { cn } from '../../utils/cn'
import { Input, Select } from '../../components/ui'
import { SOURCE_OPTIONS, TIME_OPTIONS } from './shared'

export function FilterBar({
  query,
  onQuery,
  category,
  onCategory,
  catOptions,
  moreOpen,
  onToggleMore,
  sourceType,
  onSourceType,
  time,
  onTime,
  onlyFav,
  onToggleFav,
  onlyUnread,
  onToggleUnread,
  filtersActive,
  count,
  mediaCount,
}: {
  query: string
  onQuery: (v: string) => void
  category: string
  onCategory: (v: string) => void
  catOptions: string[]
  moreOpen: boolean
  onToggleMore: () => void
  sourceType: SourceType | 'all'
  onSourceType: (v: SourceType | 'all') => void
  time: string
  onTime: (v: string) => void
  onlyFav: boolean
  onToggleFav: () => void
  onlyUnread: boolean
  onToggleUnread: () => void
  /** 任一筛选生效即视为"有明确意图" */
  filtersActive: boolean
  count: number
  mediaCount: number
}) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="搜索标题 / 标签"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="!w-40 !py-1.5 !pl-3 text-sm sm:!w-52"
        />
        <Select value={category} onChange={(e) => onCategory(e.target.value)} className="!w-auto !py-1.5 text-sm">
          {catOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <button
          onClick={onToggleMore}
          className={cn(
            'flex items-center gap-1 rounded-tile px-2.5 py-2 text-sm transition-colors',
            moreOpen || filtersActive
              ? 'bg-teal/10 text-teal'
              : 'bg-raised text-ink-muted hover:text-ink',
          )}
          aria-expanded={moreOpen}
        >
          <SlidersHorizontal size={13} /> 筛选
        </button>
        <span className="ml-auto hidden text-xs text-ink-faint sm:inline">
          {count} 条{mediaCount > 0 ? ` · ${mediaCount} 条含图` : ''}
        </span>
      </div>
      {moreOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-tile border border-line bg-raised px-2.5 py-2">
          <Select
            value={sourceType}
            onChange={(e) => onSourceType(e.target.value as SourceType | 'all')}
            className="!w-auto !py-1 text-sm"
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select value={time} onChange={(e) => onTime(e.target.value)} className="!w-auto !py-1 text-sm">
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <button
            onClick={onToggleFav}
            className={cn(
              'flex items-center gap-1 rounded-tile px-2.5 py-1.5 text-sm transition-colors',
              onlyFav ? 'bg-bronze/15 text-bronze' : 'bg-raised text-ink-muted hover:text-ink',
            )}
          >
            <Bookmark size={13} /> 收藏
          </button>
          <button
            onClick={onToggleUnread}
            className={cn(
              'flex items-center gap-1 rounded-tile px-2.5 py-1.5 text-sm transition-colors',
              onlyUnread ? 'bg-teal/15 text-teal' : 'bg-raised text-ink-muted hover:text-ink',
            )}
          >
            未读
          </button>
        </div>
      )}
    </div>
  )
}
