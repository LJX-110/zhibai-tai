/**
 * 观 · 本周回顾 —— 数据看板（周一起算；克制四格 + 近 4 周完成趋势）
 * 自己读需要的四个 store，对外零 props。
 */
import { useMemo } from 'react'
import { useTaskStore } from '../../stores/useTaskStore'
import { usePomodoroStore } from '../../stores/usePomodoroStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useHabitLogStore } from '../../stores/useHabitStore'
import { Section } from '../../components/ui'
import { todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'

function weekStart(weeksAgo = 0): Date {
  const d = new Date()
  const day = (d.getDay() + 6) % 7
  const s = new Date(d)
  s.setDate(d.getDate() - day - weeksAgo * 7)
  s.setHours(0, 0, 0, 0)
  return s
}

export function WeekReview() {
  const tasks = useTaskStore((s) => s.items)
  const pomos = usePomodoroStore((s) => s.items)
  const finances = useFinanceStore((s) => s.items)
  const habitLogs = useHabitLogStore((s) => s.items)

  const data = useMemo(() => {
    const ws = weekStart()
    const we = new Date(ws.getTime() + 7 * 864e5)
    const inRange = (iso: string | undefined, from: Date, to: Date) => {
      if (!iso) return false
      const t = new Date(iso).getTime()
      return t >= from.getTime() && t < to.getTime()
    }
    const doneThisWeek = tasks.filter((t) => t.done && inRange(t.updatedAt, ws, we)).length
    const focusMin = pomos
      .filter((p) => inRange(p.startAt, ws, we))
      .reduce((s, p) => s + p.durationMin, 0)
    const month = todayISO().slice(0, 7)
    const income = finances
      .filter((f) => f.kind === 'income' && f.date.startsWith(month))
      .reduce((s, f) => s + f.amount, 0)
    const expense = finances
      .filter((f) => f.kind === 'expense' && f.date.startsWith(month))
      .reduce((s, f) => s + f.amount, 0)
    const habitDays = new Set(
      habitLogs.filter((h) => inRange(h.date, ws, we)).map((h) => h.date),
    ).size
    const trend = [3, 2, 1, 0].map((i) => {
      const from = weekStart(i)
      const to = new Date(from.getTime() + 7 * 864e5)
      return {
        label: i === 0 ? '本周' : `${from.getMonth() + 1}/${from.getDate()}`,
        done: tasks.filter((t) => t.done && inRange(t.updatedAt, from, to)).length,
      }
    })
    return { doneThisWeek, focusMin, income, expense, habitDays, trend }
  }, [tasks, pomos, finances, habitLogs])

  const cells = [
    { label: '待办完成', value: `${data.doneThisWeek}`, unit: '件', tone: 'text-teal' },
    { label: '专注时长', value: `${data.focusMin}`, unit: '分钟', tone: 'text-cinnabar' },
    {
      label: '本月结余',
      value: `${data.income - data.expense >= 0 ? '+' : ''}${data.income - data.expense}`,
      unit: '元',
      tone: data.income - data.expense >= 0 ? 'text-teal' : 'text-cinnabar',
    },
    { label: '斩三尸打卡', value: `${data.habitDays}`, unit: '天', tone: 'text-bronze' },
  ]

  return (
    <Section title="本周回顾">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-paper bg-raised px-3 py-3">
            <div className="text-xs text-ink-muted">{c.label}</div>
            <div className={cn('tabular mt-0.5 text-lg font-semibold', c.tone)}>
              {c.value}
              <span className="ml-1 text-xs font-normal text-ink-faint">{c.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-tile border border-line bg-raised p-3">
        <div className="mb-1.5 text-xs text-ink-faint">近 4 周完成待办</div>
        <div className="space-y-1.5">
          {data.trend.map((t) => (
            <div key={t.label} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-ink-muted">{t.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-nested">
                <div
                  className="h-full rounded-full bg-gold-btn"
                  style={{ width: `${Math.min(100, (t.done / Math.max(1, ...data.trend.map((x) => x.done))) * 100)}%` }}
                />
              </div>
              <span className="tabular w-8 shrink-0 text-right text-xs text-ink-soft">{t.done}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
