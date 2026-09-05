/**
 * Badge —— 徽标/标签/来源
 */
import type { HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

type Tone = 'plain' | 'cinnabar' | 'bronze' | 'teal'

const toneClass: Record<Tone, string> = {
  plain: 'border-line bg-nested/60 text-ink-muted',
  cinnabar: 'border-cinnabar/30 bg-cinnabar/10 text-cinnabar',
  bronze: 'border-bronze/40 bg-bronze/15 text-bronze',
  teal: 'border-teal/30 bg-teal/10 text-teal',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ tone = 'plain', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap tracking-wide',
        toneClass[tone],
        className,
      )}
      {...props}
    />
  )
}
