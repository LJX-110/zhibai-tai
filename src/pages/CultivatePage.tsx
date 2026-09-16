/**
 * 修 —— 斩三尸 / 身体 / 喝水 / 成长
 * 成长页只留「今日五维道行 + 等级」单屏信息：历史曲线/月份明细这类
 * 沉重建图下沉到「观」首页需要时再看，这里不堆图表 —— 少即是多。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Plus, Trash2 } from 'lucide-react'
import { useHabitLogStore, useHabitStore } from '../stores/useHabitStore'
import { useBodyMetricLogStore, useBodyMetricStore } from '../stores/useBodyStore'
import { useWaterStore } from '../stores/useWaterStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useTodayStats } from '../hooks/useTodayStats'
import { computeCultivation, cultivationGrade } from '../services/cultivation'
import { playSound } from '../services/sound'
import { recordActivity } from '../services/activity'
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Progress,
  Ring,
  Section,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui'
import { createId, shiftDate, todayISO } from '../utils/id'
import type { BodyMetricDef, Habit, WaterLog } from '../types/entities'
import { cn } from '../utils/cn'

const TABS: TabItem[] = [
  { key: 'habit', label: '斩三尸' },
  { key: 'body', label: '身体' },
  { key: 'water', label: '喝水' },
  { key: 'growth', label: '成长' },
]

export function CultivatePage() {
  const [tab, setTab] = useState('habit')
  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="苟日新，日日新" title="修 · 修身" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />
      {tab === 'habit' && <HabitTab />}
      {tab === 'body' && <BodyTab />}
      {tab === 'water' && <WaterTab />}
      {tab === 'growth' && <GrowthTab />}
    </div>
  )
}

/* ---------------- 斩三尸 ---------------- */

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

function HabitTab() {
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
      createdAt: new Date().toISOString(),
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
      hint="坏习惯管理 · 每日计数"
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
                    <span className="truncate text-sm font-medium text-ink">{h.name}</span>
                    <span className="seal seal--active">
                      <Flame size={10} /> {streak} 天
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex gap-[3px]">
                      {month.map((c, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-4 w-[5px] rounded-full',
                            c > 0 ? 'bg-cinnabar/70' : 'bg-nested',
                          )}
                          title={`${c}`}
                        />
                      ))}
                    </div>
                    <span className="tabular text-[11px] text-ink-faint">
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
          <p className="text-[11px] text-ink-faint">
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

/* ---------------- 身体 ---------------- */

function BodyTab() {
  const defs = useBodyMetricStore((s) => s.items)
  const logs = useBodyMetricLogStore((s) => s.items)
  const toast = useToast().toast
  const today = todayISO()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [target, setTarget] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  const addDef = async () => {
    if (!name.trim()) return
    await useBodyMetricStore.getState().add({
      id: createId(),
      name: name.trim(),
      unit: unit.trim() || '',
      target: target ? Number(target) : null,
      order: defs.length,
      createdAt: new Date().toISOString(),
    })
    setName('')
    setUnit('')
    setTarget('')
    setOpen(false)
  }

  const record = async (d: BodyMetricDef, v: string) => {
    const num = Number(v)
    if (!v || Number.isNaN(num)) return
    const existing = logs.find((l) => l.metricId === d.id && l.date === today)
    if (existing) {
      await useBodyMetricLogStore.getState().update(existing.id, { value: num })
    } else {
      await useBodyMetricLogStore.getState().add({
        id: createId(),
        metricId: d.id,
        date: today,
        value: num,
      })
    }
  }

  /** 删指标要连带删它的历史记录：留着孤儿记录既占体积又会被同步带出去 */
  const removeDef = async (d: BodyMetricDef) => {
    const orphaned = logs.filter((l) => l.metricId === d.id)
    for (const l of orphaned) {
      await useBodyMetricLogStore.getState().remove(l.id)
    }
    await useBodyMetricStore.getState().remove(d.id)
    toast(orphaned.length > 0 ? `已删除「${d.name}」及其 ${orphaned.length} 条记录` : `已删除「${d.name}」`)
  }

  return (
    <Section
      title="身体"
      hint="自定义指标 · 每日记录"
      action={
        <Button size="sm" variant="tertiary" onClick={() => setOpen(true)}>
          <Plus size={14} /> 指标
        </Button>
      }
    >
      {defs.length > 0 ? (
        <div className="space-y-3">
          {defs.map((d) => {
            const todayLog = logs.find((l) => l.metricId === d.id && l.date === today)
            const trend = Array.from({ length: 7 }, (_, i) => {
              const dd = shiftDate(today, -(6 - i))
              return logs.find((l) => l.metricId === d.id && l.date === dd)?.value ?? null
            })
            const ok =
              d.target != null &&
              todayLog != null &&
              (d.target >= 0 ? todayLog.value <= d.target : todayLog.value >= Math.abs(d.target))
            return (
              <div key={d.id} className="row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{d.name}</span>
                    {d.target != null && (
                      <span className="text-[11px] text-ink-faint">目标 {d.target}{d.unit}</span>
                    )}
                    {ok && <span className="seal seal--done">达标</span>}
                  </div>
                  <div className="mt-1.5 flex items-end gap-1">
                    {trend.map((v, i) => (
                      <span
                        key={i}
                        className={cn(
                          'w-2 rounded-t',
                          v != null ? 'bg-teal/70' : 'bg-nested',
                        )}
                        style={{ height: `${(v ?? 0) > 0 ? Math.min(28, (v ?? 0) * 2) : 4}px` }}
                        title={v != null ? String(v) : '—'}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="any"
                    placeholder={`${d.unit || '数值'}`}
                    className="!w-24"
                    value={values[d.id] ?? todayLog?.value ?? ''}
                    onChange={(e) => setValues({ ...values, [d.id]: e.target.value })}
                  />
                  <Button size="sm" variant="primary" onClick={() => record(d, values[d.id] ?? String(todayLog?.value ?? ''))}>
                    记
                  </Button>
                  <button
                    onClick={() => void removeDef(d)}
                    className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-cinnabar"
                    aria-label={`删除指标 ${d.name}`}
                    title="删除该指标及其记录"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="还没有身体指标"
          desc="自定义体重、睡眠、步数等，设目标逐日记录"
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={14} /> 建指标
            </Button>
          }
        />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="新建身体指标">
        <div className="space-y-3">
          <Input autoFocus placeholder="名称，如：体重" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="单位，如：kg" value={unit} onChange={(e) => setUnit(e.target.value)} />
            <Input placeholder="目标（可选）" type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={addDef} disabled={!name.trim()}>创建</Button>
        </div>
      </Dialog>
    </Section>
  )
}

/* ---------------- 喝水 ---------------- */

function WaterTab() {
  const waterLogs = useWaterStore((s) => s.items)
  const goal = useSettingsStore((s) => s.waterGoalMl)
  const today = todayISO()

  const todayLogs = waterLogs
    .filter((w) => w.date === today)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const total = todayLogs.reduce((s, w) => s + w.amountMl, 0)
  const ratio = goal > 0 ? Math.min(1, total / goal) : 0

  const add = async (ml: number) => {
    const log = {
      id: createId(),
      date: today,
      amountMl: ml,
      createdAt: new Date().toISOString(),
    }
    await useWaterStore.getState().add(log)
    void recordActivity({ entityType: 'water', entityId: log.id, title: `喝水 +${ml}ml` })
  }
  const undo = async (w: WaterLog) => {
    await useWaterStore.getState().remove(w.id)
  }

  return (
    <Section title="喝水" hint={`目标 ${goal}ml`}>
      <div className="flex flex-wrap items-center gap-6 rounded-paper border border-line p-5">
        <Ring percent={ratio * 100} size={104} stroke={7}>
          <span className="display text-xl font-semibold text-ink tabular">{total}</span>
          <span className="text-[10px] text-ink-faint">/ {goal} ml</span>
        </Ring>
        <div className="flex-1 space-y-2">
          <Progress value={total} max={goal} bronze={ratio >= 1} />
          <div className="flex flex-wrap gap-2">
            {[200, 300, 500].map((ml) => (
              <Button key={ml} size="sm" variant={ratio >= 1 ? 'tertiary' : 'secondary'} onClick={() => add(ml)}>
                +{ml}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint">
            {ratio >= 1 ? '今日饮水已达标，很好。' : `还差 ${Math.max(0, goal - total)}ml 达标`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {todayLogs.length > 0 ? (
          <div>
            {todayLogs.map((w) => (
              <div key={w.id} className="row">
                <span className="tabular w-14 text-xs text-ink-faint">
                  {new Date(w.createdAt).toTimeString().slice(0, 5)}
                </span>
                <span className="flex-1 text-sm text-ink">{w.amountMl}ml</span>
                <Button size="sm" variant="danger" onClick={() => undo(w)}>
                  撤回
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="今日尚未饮水" desc="点上方按钮记录一杯" />
        )}
      </div>
    </Section>
  )
}

/* ---------------- 成长（今日五维 · 轻量化） ---------------- */

function GrowthTab() {
  const stats = useTodayStats()
  const cultivation = useMemo(
    () =>
      computeCultivation({
        tasksDoneToday: stats.tasksDone,
        focusMinutesToday: stats.focusMinutes,
        waterRatio: stats.waterRatio,
        habitLogsToday: stats.habitLogs,
        bodyLogsToday: stats.bodyLogs,
        notesToday: stats.notesToday,
        creationsToday: stats.creations,
      }),
    [stats],
  )
  const grade = cultivationGrade(cultivation.total)
  // 等级提升音效：缓存上次渲染的等级标题，首次进入不播，真的升级才响
  const prevGradeRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevGradeRef.current && prevGradeRef.current !== grade.title && grade.title !== '初窥门径') {
      playSound('levelup')
    }
    prevGradeRef.current = grade.title
  }, [grade.title])

  return (
    <div className="space-y-3">
      {/* 今日道行：圆环 + 等级 */}
      <Section title="今日道行" hint={grade.title}>
        <div className="flex items-center gap-5">
          <Ring percent={cultivation.total} size={112} stroke={9}>
            <span className="tabular text-xl font-semibold text-ink">{cultivation.total}</span>
            <span className="text-[10px] text-ink-faint">/ 100</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink">{grade.title}</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{grade.desc}</p>
          </div>
        </div>
      </Section>

      {/* 五维分解：行 / 学 / 身 / 心 / 创 */}
      <Section title="五维" hint="今日各维度得分">
        <div className="space-y-2.5">
          {cultivation.dimensions.map((d) => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="display w-6 shrink-0 text-sm font-semibold text-ink">{d.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-nested">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    d.value >= d.max * 0.75
                      ? 'bg-teal'
                      : d.value >= d.max * 0.4
                        ? 'bg-bronze'
                        : 'bg-cinnabar/60',
                  )}
                  style={{ width: `${(d.value / d.max) * 100}%` }}
                />
              </div>
              <span className="tabular w-10 shrink-0 text-right text-xs text-ink-muted">
                {d.value}/{d.max}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
