/**
 * 修 · 斩三尸页签
 */
import { useState } from 'react'
import { Flame, Plus } from 'lucide-react'
import { useHabitLogStore, useHabitStore } from '../../stores/useHabitStore'
import { recordActivity } from '../../services/activity'
import { Button, Dialog, EmptyState, Input, Section } from '../../components/ui'
import { createId, shiftDate, todayISO, nowISO } from '../../utils/id'
import type { Habit } from '../../types/entities'
import { cn } from '../../utils/cn'

/** 连续达标天数（截至某日） */
function streakOf(logs: { date: string; count: number }[], target: number, upTo: string): number {
  let day = upTo
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const log = logs.find((l) => l.date === day)
    if (log && log.count >= target) {
      streak++
      day = shiftDate(day, -1)
    } else {
      break
    }
  }
  return streak
}

export function HabitTab() {
  const habits = useHabitStore((s) => s.items)
  const habitLogs = useHabitLogStore((s) => s.items)
  const today = todayISO()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState(1)
  const [unit, setUnit] = useState('')

  const addHabit = async () => {
    if (!name.trim()) return
    await useHabitStore.getState().add({
      id: createId(),
      name: name.trim(),
      targetPerDay: target,
      unit: unit.trim() || undefined,
      order: habits.length,
      createdAt: nowISO(),
    })
    setName('')
    setOpen(false)
  }

  const bump = async (h: Habit) => {
    const todayLog = habitLogs.find((l) => l.habitId === h.id && l.date === today)
    if (todayLog) {
      await useHabitLogStore.getState().update(todayLog.id, {
        count: todayLog.count + 1,
      })
    } else {
      await useHabitLogStore.getState().add({
        id: createId(),
        habitId: h.id,
        date: today,
        count: 1,
      })
    }
    void recordActivity({ entityType: 'habit', entityId: h.id, title: `斩三尸 +1：${h.name}` })
  }

  const removeHabit = async (h: Habit) => {
    await useHabitStore.getState().remove(h.id)
    // 连带删除记录（保留存储键，删除主习惯时清其日志）
    for (const l of habitLogs.filter((l) => l.habitId === h.id)) {
      await useHabitLogStore.getState().remove(l.id)
    }
  }

  return (
    <Section
      title="斩三尸"

      action={
        <Button size="sm" variant="tertiary" onClick={() => setOpen(true)}>
          <Plus size={14} /> 立誓
        </Button>
      }
    >
      {habits.length > 0 ? (
        <div className="space-y-2">
          {habits.map((h) => {
            const todayLog = habitLogs.find((l) => l.habitId === h.id && l.date === today)
            const count = todayLog?.count ?? 0
            const streak = streakOf(
              habitLogs.filter((l) => l.habitId === h.id),
              h.targetPerDay,
              shiftDate(today, -1),
            )
            const month = Array.from({ length: 14 }, (_, i) => {
              const d = shiftDate(today, -(13 - i))
              return habitLogs.find((l) => l.habitId === h.id && l.date === d)?.count ?? 0
            })
            const monthTotal = habitLogs
              .filter((l) => l.habitId === h.id && l.date.startsWith(today.slice(0, 7)))
              .reduce((s, l) => s + l.count, 0)
            return (
              <div key={h.id} className="row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* 长习惯名在窄屏会撑破 .row：min-w-0 才能让 truncate 生效，
                        印章 shrink-0 不被压扁 */}
                    <span className="min-w-0 truncate text-sm font-medium text-ink">{h.name}</span>
                    <span className="seal seal--active shrink-0">
                      <Flame size={10} /> {streak} 天
                    </span>
                  </div>
                  {/* 柱子 shrink-0 防被压扁；整行允许换行 —— 本月柱数最多 31 根，
                      窄屏上必须给文案留出换行的余地，否则文字被挤成两三个字一行 */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="flex shrink-0 gap-[3px]">
                      {month.map((c, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-4 w-[5px] shrink-0 rounded-full',
                            c > 0 ? 'bg-cinnabar/70' : 'bg-nested',
                          )}
                          title={`${c}`}
                        />
                      ))}
                    </div>
                    <span className="tabular min-w-0 truncate text-xs text-ink-faint">
                      今日 {count}/{h.targetPerDay}
                      {h.unit ? ` ${h.unit}` : ' 次'} · 本月 {monthTotal}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant={count >= h.targetPerDay ? 'ritual' : 'primary'} onClick={() => bump(h)}>
                  +1
                </Button>
                <Button size="sm" variant="danger" onClick={() => removeHabit(h)}>
                  除
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="尚未立誓"
          desc="把想斩掉的坏习惯列出来，逐日计数，斩断旧习"
          action={
            <Button variant="ritual" onClick={() => setOpen(true)}>
              <Plus size={14} /> 立第一个誓
            </Button>
          }
        />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="立誓 · 斩一坏习惯">
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="要斩掉的习惯，如：刷短视频"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value) || 1)}
              aria-label="每日目标次数"
            />
            <Input
              placeholder="单位（可选）"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <p className="text-xs text-ink-faint">
            目标：每天不超过 {target} 次（或 {target} {unit || '次'}），连续坚持视为斩成
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={addHabit} disabled={!name.trim()}>立誓</Button>
        </div>
      </Dialog>
    </Section>
  )
}
