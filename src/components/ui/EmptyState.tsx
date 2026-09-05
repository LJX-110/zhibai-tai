/**
 * EmptyState —— 空态（完整产品结构：说明 + 下一步 + 主要操作）
 * 右下角淡太极底纹：留白处保持品牌记忆点（低透明度不抢内容）
 */
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Taiji } from './Taiji'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  desc?: string
  /** 下一步提示（例：'先加入一个 Prompt 或 Skill'） */
  step?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, desc, step, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'talisman talisman--line relative flex flex-col items-center justify-center gap-2 overflow-hidden px-6 py-14 text-center',
        className,
      )}
    >
      <div className="pointer-events-none absolute -bottom-4 -right-3 opacity-[0.05]" aria-hidden="true">
        <Taiji size={88} />
      </div>
      {Icon && (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-[6px] border border-line-strong bg-panel text-ink-faint">
          <Icon size={20} strokeWidth={1.5} />
        </div>
      )}
      <p className="scribal-title text-lg font-normal text-ink-soft">{title}</p>
      {desc && <p className="max-w-[320px] text-[13px] leading-relaxed text-ink-faint">{desc}</p>}
      {step && (
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="h-1 w-1 rotate-45 bg-bronze" />
          下一步 · {step}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
