/**
 * 术 · 类型网格（数据化后唯一的一套类型体系：可增/删/改名）
 */
import { createElement } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '../../utils/cn'
import { typeIcon } from './shared'

export function TypeGrid({
  types,
  active,
  total,
  countOf,
  onSelect,
  onManage,
}: {
  types: string[]
  /** 当前筛选的类型（'all' 表示全部） */
  active: string
  total: number
  countOf: (t: string) => number
  onSelect: (t: string) => void
  onManage: () => void
}) {
  return (
    <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-7 max-[420px]:grid-cols-3">
      <button
        onClick={() => onSelect('all')}
        className={cn(
          'group flex flex-col items-start gap-1 rounded-tile border px-3 py-2.5 text-left transition-colors',
          active === 'all'
            ? 'border-cinnabar/40 bg-cinnabar/5'
            : 'border-line bg-paper/40 hover:border-line-strong',
        )}
      >
        <span className={cn('text-sm font-medium', active === 'all' ? 'text-cinnabar' : 'text-ink')}>
          全部
        </span>
        <span className="tabular text-xs text-ink-faint">{total}</span>
      </button>
      {types.map((t) => {
        const isActive = active === t
        return (
          <button
            key={t}
            onClick={() => onSelect(t)}
            className={cn(
              'group flex flex-col items-start gap-1 rounded-tile border px-3 py-2.5 text-left transition-colors',
              isActive
                ? 'border-cinnabar/40 bg-cinnabar/5'
                : 'border-line bg-paper/40 hover:border-line-strong',
            )}
          >
            <span className="flex w-full items-center gap-1.5">
              {createElement(typeIcon(t), {
                size: 13,
                className: cn('shrink-0', isActive ? 'text-cinnabar' : 'text-ink-faint'),
              })}
              <span className={cn('min-w-0 truncate text-sm font-medium', isActive ? 'text-cinnabar' : 'text-ink')}>
                {t}
              </span>
            </span>
            <span className="tabular text-xs text-ink-faint">{countOf(t)}</span>
          </button>
        )
      })}
      {/* 类型管理入口：常显，空库也能建类型 */}
      <button
        onClick={onManage}
        aria-label="管理类型"
        className="flex flex-col items-start justify-center gap-1 rounded-tile border border-dashed border-line-strong/70 px-3 py-2.5 text-left text-ink-faint transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
      >
        <Plus size={14} />
        <span className="text-xs">管理类型</span>
      </button>
    </div>
  )
}
