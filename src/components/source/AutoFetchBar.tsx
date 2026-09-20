/**
 * 情报源 · 定时自动抓取开关（含间隔选择）
 * 纯展示 + 回调：写设置与重启定时器由父组件统一负责（避免两处各写一遍）。
 */
import { Select } from '../ui'
import { cn } from '../../utils/cn'

export function AutoFetchBar({
  auto,
  minutes,
  onToggle,
  onMinutes,
}: {
  auto: boolean
  minutes: number
  onToggle: () => void
  onMinutes: (n: number) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-line bg-paper/50 px-3 py-2">
      <span className="text-sm text-ink">定时自动抓取</span>
      <button
        role="switch"
        aria-checked={auto}
        onClick={onToggle}
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          auto ? 'bg-teal' : 'bg-nested',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
            auto ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
      <span className="text-xs text-ink-faint">间隔</span>
      <Select
        value={String(minutes)}
        onChange={(e) => onMinutes(Number(e.target.value))}
        className="!w-auto !py-1 text-xs"
        disabled={!auto}
        aria-label="抓取间隔"
      >
        <option value="30">30 分钟</option>
        <option value="60">1 小时</option>
        <option value="360">6 小时</option>
      </Select>
      <span className="ml-auto text-xs text-ink-faint">
        {auto ? `每 ${minutes} 分钟自动拉取启用源` : '默认关闭'}
      </span>
    </div>
  )
}
