/**
 * 藏 · 藏品列表卡
 * 卡片固定 aspect-[3/4] + overflow-hidden，所以标题/分类/状态都必须能截断，
 * 否则多出来的内容会被直接裁掉（而不是撑高卡片）。
 */
import { Star } from 'lucide-react'
import { Badge } from '../../components/ui'
import type { CollectionItem } from '../../types/entities'
import { cn } from '../../utils/cn'
import { typeLabel, typeStripe } from './shared'

export function CollectionItemCard({
  it,
  onOpen,
  onToggleFav,
}: {
  it: CollectionItem
  onOpen: () => void
  onToggleFav: () => void
}) {
  return (
    <div
      onClick={onOpen}
      className="group relative flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-tile border border-line bg-raised transition-all duration-fast hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.98]"
    >
      {/* 左侧类型签条（与记事本同语言） */}
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', typeStripe(it.type))} />
      <div className="flex flex-1 flex-col p-3 pl-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted">{typeLabel(it.type)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFav()
            }}
            className={cn(
              'rounded-control p-1.5 transition-colors',
              it.favorite ? 'text-bronze' : 'text-ink-faint hover:text-bronze',
            )}
            aria-label="收藏"
          >
            <Star size={15} fill={it.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        {/* 标题区：居中书法大字 */}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-1 text-center">
          {/* 两列布局时卡片更窄，标题随之降一档，避免 20px 在小卡里挤到第三行 */}
          <span className="scribal-title line-clamp-2 text-lg leading-snug text-ink sm:text-xl">
            {it.title}
          </span>
          {it.category && (
            // 卡片固定 aspect-[3/4] + overflow-hidden，长分类名不截断会被裁掉
            <span className="max-w-full truncate text-xs text-ink-muted">{it.category}</span>
          )}
        </div>
        {/* 底部：状态 / 标签 / 评级 —— 固定单行并截断。
            此前用 flex-wrap，自定义状态文案一长就折行；而卡片是
            aspect-[3/4] + overflow-hidden，多出来的那行会被直接裁掉 */}
        <div className="mt-2 flex items-center gap-1.5 border-t border-line/70 pt-2">
          {it.status && (
            <Badge tone="plain" className="max-w-[48%] truncate">
              {it.status}
            </Badge>
          )}
          <span className="ml-auto flex min-w-0 items-center gap-1.5">
            {/* 保留两个标签（此前误改成只显示第一个，等于静默丢了一条信息） */}
            {it.tags.slice(0, 2).map((t) => (
              <span key={t} className="truncate text-xs text-ink-faint">#{t}</span>
            ))}
            {it.rating != null && (
              <span className="tabular shrink-0 text-xs text-bronze">
                {'★'.repeat(it.rating)}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
