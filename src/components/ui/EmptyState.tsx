/**
 * EmptyState —— 空态（完整产品结构：说明 + 下一步 + 主要操作）
 * 中央偏上放蓝白太极水印（TaijiWatermark，全局统一水印，8% 透明度不抢内容）
 */
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import { TaijiWatermark } from './Watermark'

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
        'talisman talisman--line relative flex flex-col items-center justify-center gap-2 overflow-hidden px-6 py-8 text-center md:py-14',
        className,
      )}
    >
      <TaijiWatermark
        id="es-b"
        variant="blue"
        opacity={0.08}
        style={{ position: 'absolute', top: -14, right: -14, width: 100, height: 100 }}
      />
      <TaijiWatermark
        id="es-r"
        variant="red"
        opacity={0.08}
        style={{ position: 'absolute', bottom: -16, left: -14, width: 100, height: 100 }}
      />
      {Icon && (
        <div className="mb-2 hidden h-12 w-12 items-center justify-center rounded-[6px] border border-line-strong bg-paper/60 text-ink-faint md:flex">
          <Icon size={20} strokeWidth={1.5} />
        </div>
      )}
      <p className="scribal-title text-lg font-normal text-ink-soft">{title}</p>
      {/* 解释说明属于新手期信息：桌面保留，手机收起——空态只剩标题+主按钮，
          避免手机上再堆一段小字 */}
      {desc && <p className="hidden max-w-[320px] text-[13px] leading-relaxed text-ink-faint md:block">{desc}</p>}
      {/* 「下一步」属于新手期的说明性文字：桌面保留，手机收起，空态不再占半屏 */}
      {step && (
        <p className="mt-0.5 hidden items-center gap-1.5 text-xs text-ink-muted md:flex">
          <span className="h-1 w-1 rotate-45 bg-bronze" />
          下一步 · {step}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
