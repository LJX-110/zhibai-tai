/**
 * Calendar —— 月历（暖玉/象牙色石面，浅墨数字，今日朱砂圈）
 */
import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../utils/cn'
import { todayISO, toISODate, weekdayCN } from '../../utils/id'

export interface CalendarProps {
  /** 当前月份 yyyy-mm */
  month: string
  onMonthChange: (month: string) => void
  /** dateISO -> 标记数（如待办数量） */
  marks?: Record<string, number>
  onSelectDate?: (date: string) => void
  selected?: string | null
}

export function Calendar({ month, onMonthChange, marks, onSelectDate, selected }: CalendarProps) {
  const today = todayISO()
  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const startWeekday = first.getDay()
    const total = new Date(y, m, 0).getDate()
    const cells: (string | null)[] = Array.from({ length: startWeekday }, () => null)
    for (let d = 1; d <= total; d++) {
      cells.push(toISODate(new Date(y, m - 1, d)))
    }
    return cells
  }, [month])

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const next = new Date(y, m - 1 + delta, 1)
    onMonthChange(toISODate(next).slice(0, 7))
  }

  return (
    <div className="rounded-tile border border-line bg-raised p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <span className="scribal-title text-lg text-ink">
          {Number(month.slice(5))} 月 · {month.slice(0, 4)}
        </span>
        <div className="flex gap-1">
          <button className="rounded-control p-1 text-ink-muted hover:bg-nested" onClick={() => shift(-1)} aria-label="上月">
            <ChevronLeft size={15} />
          </button>
          <button className="rounded-control p-1 text-ink-muted hover:bg-nested" onClick={() => shift(1)} aria-label="下月">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays().map((w) => (
          <div key={w} className="py-1 text-[10px] tracking-wider text-ink-faint">
            {w}
          </div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const marked = (marks?.[d] ?? 0) > 0
          const isToday = d === today
          const isSel = d === selected
          return (
            <button
              key={d}
              onClick={() => onSelectDate?.(d)}
              className={cn(
                'relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                isSel
                  ? 'bg-teal font-medium text-on-teal'
                  : isToday
                    ? 'font-semibold text-cinnabar ring-1 ring-cinnabar'
                    : 'text-ink-soft hover:bg-nested',
              )}
            >
              {Number(d.slice(8))}
              {marked && (
                <span
                  className={cn(
                    'absolute bottom-1 h-1 w-1 rounded-full',
                    isSel ? 'bg-on-teal' : isToday ? 'bg-cinnabar' : 'bg-bronze',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function weekdays(): string[] {
  return Array.from({ length: 7 }, (_, i) => weekdayCN(i))
}
