/**
 * Tabs —— 页内分段（学/修/行 的子页切换）
 */
import { cn } from '../../utils/cn'

export interface TabItem {
  key: string
  label: string
  count?: number
}

export interface TabsProps {
  items: TabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ items, active, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 overflow-x-auto pb-1 border-b border-line no-scrollbar',
        className,
      )}
    >
      {items.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'relative shrink-0 px-3 py-2 text-sm rounded-tile transition-colors duration-fast',
            active === t.key
              ? 'text-ink font-medium'
              : 'text-ink-muted hover:text-ink-soft',
          )}
        >
          {t.label}
          {t.count != null && (
            <span className="ml-1 text-xs text-ink-faint">{t.count}</span>
          )}
          {active === t.key && (
            <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-cinnabar" />
          )}
        </button>
      ))}
    </div>
  )
}
