/**
 * Button —— 统一按钮体系
 * 变体：primary(朱砂) / secondary / tertiary / danger / ritual(铜金·仪式)
 * 规则：无 Success 变体；铜金仅用于仪式/焦点操作
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ritual'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClass: Record<Variant, string> = {
  primary: 'ink-btn ink-btn--teal text-on-teal',
  secondary: 'ink-btn ink-btn--paper text-ink',
  tertiary: 'bg-transparent text-ink-soft hover:bg-raised',
  danger: 'bg-transparent text-cinnabar border border-cinnabar/40 hover:bg-cinnabar/5',
  ritual: 'ink-btn ink-btn--bronze text-on-gold',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-[4px] font-medium transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed select-none',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
