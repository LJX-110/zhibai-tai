/**
 * 观 · 今日轨迹（首页时间轴）与「全部轨迹」抽屉
 * 两个组件都只依赖显式传入的数据，不读 store。
 */
import type { ComponentProps } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, EmptyState, Section, Sheet, Timeline } from '../../components/ui'
import { formatHM } from '../../utils/id'
import type { ActivityItem } from '../../types/entities'

export function TodayTraceSection({
  track,
  onOpenAll,
}: {
  track: ComponentProps<typeof Timeline>['items']
  onOpenAll: () => void
}) {
  return (
    <Section
      title="今日轨迹"
      hint={`${track.length} 条`}
      action={
        <Button size="sm" variant="tertiary" onClick={onOpenAll}>
          全部 <ArrowRight size={13} />
        </Button>
      }
    >
      {track.length > 0 ? (
        <Timeline items={track} />
      ) : (
        <EmptyState
          title="今日尚无轨迹"
          desc="完成待办、专注、记录或收藏后会自动出现在这里"
          step="先做一件事，轨迹自会浮现"
        />
      )}
    </Section>
  )
}

/** 全部轨迹 Sheet */
export function AllTraceSheet({
  open,
  onClose,
  activities,
}: {
  open: boolean
  onClose: () => void
  activities: ActivityItem[]
}) {
  return (
    <Sheet open={open} onClose={onClose} title="个人轨迹">
      {activities.length > 0 ? (
        <div className="max-h-[60vh] overflow-y-auto">
          {[...activities]
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, 60)
            .map((a) => (
              <div key={a.id} className="row">
                <span className="tabular w-12 shrink-0 text-xs text-ink-faint">{formatHM(a.timestamp)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.title}</span>
                {a.metadata && <span className="truncate text-xs text-ink-faint">{a.metadata}</span>}
              </div>
            ))}
        </div>
      ) : (
        <EmptyState title="还没有轨迹" desc="使用待办、番茄钟、喝水、收藏等会自动记录" />
      )}
    </Sheet>
  )
}
