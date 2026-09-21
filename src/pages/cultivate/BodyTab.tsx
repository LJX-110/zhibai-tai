/**
 * 修 · 身体页签
 */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useBodyMetricLogStore, useBodyMetricStore } from '../../stores/useBodyStore'
import { Button, Dialog, EmptyState, Input, Section, useToast } from '../../components/ui'
import { createId, shiftDate, todayISO, nowISO } from '../../utils/id'
import type { BodyMetricDef } from '../../types/entities'
import { cn } from '../../utils/cn'

export function BodyTab() {
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
      createdAt: nowISO(),
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
                    {/* 长指标名在窄屏会撑破 .row：min-w-0 才能让 truncate 生效，
                        目标/达标 shrink-0 不被压扁 */}
                    <span className="min-w-0 truncate text-sm font-medium text-ink">{d.name}</span>
                    {d.target != null && (
                      <span className="shrink-0 text-xs text-ink-faint">目标 {d.target}{d.unit}</span>
                    )}
                    {ok && <span className="seal seal--done shrink-0">达标</span>}
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
          <Input autoFocus placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
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
