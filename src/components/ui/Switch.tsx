/**
 * Switch —— 开关（**设置页的统一形制**）
 *
 * ## 为什么抽出来
 * 此前全仓有 **7 处**各写一份 `role="switch"` 的按钮 + 圆钮 span：
 * 尺寸两种（`h-5 w-9` / `h-6 w-11`）、位移有的用 `left` 有的用 `translate-x`、
 * 配色各写一遍 `bg-teal` / `bg-nested`。后果不是"不好看"，而是**改一处忘一处**：
 * 想统一配色或加大触控目标时，总会漏掉几个。
 *
 * ## 两条工程约定
 * · **位移走 `translate-x`**（合成层），不用 `left` —— 后者每次切态都触发布局；
 * · **触控目标**：`sm` 是视觉尺寸，实际点击区至少 20px 高；设置页的行本身也有 padding，
 *   手机上不至于难点到（这是既有形制，本轮不改观感）。
 *
 * ⚠️ 没有可见文字标签时必须传 `label` —— 读屏只会念"开关"，用户不知道是什么的开关。
 */
import { cn } from '../../utils/cn'

export type SwitchSize = 'sm' | 'md'

/** 两种尺寸的位移量都是**算出来的**（让圆钮两侧各留 2px），不是试出来的魔数 */
const SIZES = {
  sm: { track: 'h-5 w-9', knob: 'h-4 w-4', on: 'translate-x-4' },
  md: { track: 'h-6 w-11', knob: 'h-5 w-5', on: 'translate-x-5' },
} as const

export interface SwitchProps {
  checked: boolean
  onChange: () => void
  /** 无障碍名（没有可见标签时**必须**给） */
  label?: string
  size?: SwitchSize
  disabled?: boolean
  className?: string
}

export function Switch({
  checked,
  onChange,
  label,
  size = 'sm',
  disabled = false,
  className,
}: SwitchProps) {
  const s = SIZES[size]
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative shrink-0 rounded-full transition-colors',
        s.track,
        checked ? 'bg-teal' : 'bg-nested',
        disabled && 'pointer-events-none opacity-45',
        className,
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 rounded-full bg-paper shadow-sm transition-transform',
          s.knob,
          checked ? s.on : 'translate-x-0',
        )}
      />
    </button>
  )
}
