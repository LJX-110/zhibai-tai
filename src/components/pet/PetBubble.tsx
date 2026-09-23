/**
 * 桌宠气泡（P4 碎碎念 · 形态 A：带底气泡 + 尾角）
 *
 * ## 呈现纪律（与全站一致）
 *  · 位置只走 `transform`（合成层），不动 left/top —— 尾角用两枚旋转方块拼（一枚出边框、一枚出底色），
 *    避免"画的三角盖不住边框"这种补丁套补丁的写法；
 *  · 出现/消失只动 `opacity` + 轻微 `translateY`，且遵守 `prefers-reduced-motion`；
 *  · 可点时右侧给一个 `›`（与通知深链同一套 hash），不可点时不画。
 *
 * 气泡**不自己计消失时间** —— 时长由 `usePetSaying` 统一管（与节流同源，才好配"每天最多几条"）。
 */
import { cn } from '../../utils/cn'
import type { Saying } from '../../services/pet/sayings'

export interface PetBubbleProps {
  saying: Saying
  /** 宠物包围盒左上角（视口 px） */
  x: number
  y: number
  /** 宠物显示边长（宽；高按 16:9） */
  size: number
  reducedMotion: boolean
  /** 点 `›` 时跳到对应板块 */
  onGo: () => void
}

export function PetBubble({ saying, x, y, size, reducedMotion, onGo }: PetBubbleProps) {
  const clickable = saying.hash !== ''
  return (
    <div
      className={cn(
        // 字号例外：气泡根字号 —— 它要明显小于正文（是"嘀咕"不是"段落"），
        // 且受 max-w 限制，13px 才能在两行内说完一句
        'pointer-events-none fixed z-[var(--z-pet)] w-max max-w-[240px] rounded-tile border border-line bg-paper px-2.5 py-1.5 text-[13px] leading-snug text-ink shadow-float',
        reducedMotion ? 'transition-none' : 'transition-[opacity,transform] duration-150',
      )}
      style={{
        // 挂到宠物正上方，水平居中于宠物包围盒
        left: x + size / 2,
        top: y - 6,
        transform: 'translate(-50%, -100%)',
        willChange: 'transform,opacity',
      }}
      aria-live="polite"
    >
      {saying.text}
      {clickable && (
        <button
          type="button"
          onClick={onGo}
          className="pointer-events-auto ml-1 text-teal"
          aria-label="去看看"
        >
          ›
        </button>
      )}
    </div>
  )
}
