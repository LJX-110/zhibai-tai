/**
 * Button —— 统一按钮体系
 *
 * 变体语义（**不设 success 变体**：成功不需要按钮，"完成"由 ritual / tertiary 承担，
 * 再加一个绿色只会让颜色语义膨胀）：
 *  · primary   黛蓝实底   —— 一屏一个的主操作（保存 / 开始）
 *  · secondary 宣纸墨框   —— 同级别备选、取消
 *  · tertiary  无底无框   —— 行内次要操作与图标按钮（列表里用得最多，视觉最轻）
 *  · danger    绛红描边   —— 破坏性操作。刻意不做实底：删除不该比主操作更抢眼
 *  · ritual    鎏金实底   —— 仪式 / 焦点时刻（起卦、立誓、完成），全站克制使用
 *
 * 四态：
 *  · hover          实底走 .ink-btn 的墨迹晕染（index.css），tertiary/danger 走浅底
 *  · active         实底为「落印」（.ink-btn:active 的轻压微斜），tertiary/danger 加深一档底色
 *  · focus-visible  交全局 :focus-visible 统管（index.css 的 2px 焦点环），
 *                   组件内不再各写一套，避免同一个应用出现两种焦点样式
 *  · disabled       opacity-40 + 禁用光标，且不再响应 hover / active
 *                   （禁用抑制见 styles/ui-rules.css：.ink-btn 的墨韵与落印
 *                   写在 @layer 之外，工具类压不住，只能在那里收口）
 *
 * 触控目标：手机端（<768px）sm 抬到 36px。h-7 只有 28px，而 sm 大量用在
 * 列表行的图标/次级按钮上，手指点不准；桌面端保持紧凑不变。
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import { sfx } from '../../services/sound'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ritual'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** 不播放点击音（按钮本身有专属音效/高频场景用） */
  silent?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'ink-btn ink-btn--teal text-on-teal',
  secondary: 'ink-btn ink-btn--paper text-ink',
  // disabled:hover 回归透明：tertiary/danger 常态就是透明底，
  // 不写的话禁用按钮仍会随悬停浮出浅底
  tertiary:
    'bg-transparent text-ink-soft hover:bg-raised active:bg-nested disabled:hover:bg-transparent disabled:active:bg-transparent',
  danger:
    'bg-transparent text-cinnabar border border-cinnabar/40 hover:bg-cinnabar/5 active:bg-cinnabar/10 disabled:hover:bg-transparent disabled:active:bg-transparent',
  ritual: 'ink-btn ink-btn--bronze text-on-gold',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-7 max-md:h-9 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', silent, onClick, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed select-none',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      onClick={(e) => {
        if (!silent) sfx.click()
        onClick?.(e)
      }}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
