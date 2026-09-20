/**
 * 修 · 喝水页签
 */
import { useWaterStore } from '../../stores/useWaterStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { recordActivity } from '../../services/activity'
import { Button, EmptyState, Progress, Ring, Section } from '../../components/ui'
import { createId, formatHM, todayISO, nowISO } from '../../utils/id'
import type { WaterLog } from '../../types/entities'

export function WaterTab() {
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
      createdAt: nowISO(),
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
          {/* 字号例外：环内文字受 104px 圆径约束（内圈可用宽约 64px），
              10px 是唯一能让「/ 2000 ml」在环内单行放下的档位，放大即溢出圆外。 */}
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
          <p className="text-xs text-ink-faint">
            {ratio >= 1 ? '今日饮水已达标，很好。' : `还差 ${Math.max(0, goal - total)}ml 达标`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {todayLogs.length > 0 ? (
          <div>
            {todayLogs.map((w) => (
              <div key={w.id} className="row">
                <span className="tabular w-14 text-xs text-ink-faint">{formatHM(w.createdAt)}</span>
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
