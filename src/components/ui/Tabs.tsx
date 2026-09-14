/**
 * Tabs —— 页内分段（学/修/行 的子页切换）
 *
 * 移动端页签常年超出屏宽（「学」有 6 个）。此前只有一个 overflow-x-auto，
 * 既看不出还能横向滑动，切到靠后的页签也不会自动带回视野 ——
 * 结果就是「页签不全、点不到」。滚动的两层处理（右缘渐隐 + 选中项居中）
 * 已抽到 ScrollRow，这里直接复用，避免两处实现各自漂移。
 */
import { cn } from '../../utils/cn'
import { ScrollRow } from './ScrollRow'

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
    <ScrollRow
      className={cn('border-b border-line pb-1', className)}
      activeSelector={'[data-active="true"]'}
      activeKey={active}
    >
      {items.map((t) => (
        <button
          key={t.key}
          role="tab"
          data-active={active === t.key || undefined}
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'relative shrink-0 rounded-tile px-3 py-2 text-sm transition-colors duration-fast',
            active === t.key
              ? 'font-medium text-ink'
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
    </ScrollRow>
  )
}
