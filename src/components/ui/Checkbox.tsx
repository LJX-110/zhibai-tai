/**
 * Checkbox —— 印章勾选（完成 → 朱砂落印，替代普通打勾）
 */
import { cn } from '../../utils/cn'
import { Check } from 'lucide-react'

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  disabled?: boolean
}

export function Checkbox({
  checked,
  onChange,
  className,
  disabled,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'shrink-0 inline-flex items-center justify-center w-[20px] h-[20px] rounded-[5px] border transition-all duration-fast',
        checked
          ? 'seal-check'
          : 'bg-raised border-line-strong hover:border-cinnabar/60 hover:bg-cinnabar/5',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  )
}
