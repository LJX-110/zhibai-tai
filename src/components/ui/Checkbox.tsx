/**
 * Checkbox —— 方角印章勾选（完成 → 朱砂落印，替代普通打勾）
 *
 * 形制分工（改这里之前先读 SealCheckbox.tsx 的头部说明）：
 *   本组件 = **方角** + `seal-check` 实底朱砂印，用于表单里的布尔项；
 *   圆形 + 篆书印章的「列表行完成」勾选用 `ui/SealCheckbox`。
 *
 * 现存用法只剩 FinancePage 的「购买」表单项（方角是那里的既定形制）。
 * 待办行与作业行已迁移到 SealCheckbox，因此本文件**不要删**：
 * 还有调用方在用它，删掉即编译失败。
 * 迁移方向：FinancePage 那处方角用法待评估是否并入圆形形制，届时本文件才可退场。
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
        'shrink-0 inline-flex items-center justify-center w-[20px] h-[20px] rounded-chip border transition-all duration-fast',
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
