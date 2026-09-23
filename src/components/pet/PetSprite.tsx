/**
 * 桌宠 · 渲染层
 *
 * 只做三件事：**定位（transform）、朝向（scaleX 镜像）、换动画（key 重挂载）**。
 *
 * 动画性能纪律（与全站一致）：
 *  · 位移只走 `transform`（GPU 合成），**不动 left/top** —— 后者每帧触发重排；
 *  · 换动画用 `key={anim}` 重挂载 `<img>` —— 不重挂载的话，同一张 animated WebP
 *    不会从第一帧重播，表现为"点了它但没反应"；
 *  · `prefers-reduced-motion` 下由状态机保证不会进入 move/turn，这里再用
 *    `transition-none` 兜一层，避免样式层面残留补间。
 *
 * 交互：只有宠物自身的矩形可点（`pointer-events` 只在该矩形上开），
 * 否则一个 fixed 全屏层会挡住整个应用的点击。
 *
 * P3 拖拽（2026-09-23）：指针事件**原样转发**给 hook，这里不做任何判断 ——
 * 阈值、跟手、夹回视口、甩抛全在 `usePetLoop` 里（可测），渲染层越薄越好。
 * `nodeRef` 由 hook 持有：抛掷阶段它直接写这个节点的 `transform`，
 * 绕开 React 渲染（每帧 60 次 setState 会把整棵树带上渲染路径）。
 */
import { memo, useRef } from 'react'
import { cn } from '../../utils/cn'
import type { PetView } from '../../hooks/usePetLoop'
import type { PetDragHandlers } from '../../hooks/usePetDrag'

/** 长按多久算"唤起菜单"（移动端的右键等价操作） */
const LONG_PRESS_MS = 500
/** 长按期间手指移动超过这个距离就取消（那是在拖它，不是要菜单） */
const LONG_PRESS_SLOP = 8

export interface PetSpriteProps extends PetView {
  /** 宠物显示边长（px，宽；高按 16:9 推） */
  size: number
  /** 显示名（悬浮提示） */
  name: string
  reducedMotion: boolean
  onClick: () => void
  /** 由 hook 持有：抛掷阶段直接改它的 transform */
  nodeRef: React.RefObject<HTMLDivElement | null>
  drag: PetDragHandlers
  /** 长按唤起菜单（桌面走 contextmenu，由外层处理） */
  onLongPress?: () => void
}

export const PetSprite = memo(function PetSprite({
  anim,
  src,
  x,
  y,
  facing,
  transitionMs,
  size,
  name,
  reducedMotion,
  onClick,
  nodeRef,
  drag,
  onLongPress,
}: PetSpriteProps) {
  const height = (size * 9) / 16
  /* 长按：手指按下不动 500ms 才唤菜单；中途移动或抬手就取消 ——
     否则"拖着玩"每次都会被误判成要菜单。与拖拽共用同一组指针事件，
     所以在这里**转发**，不让外层再挂一份（两份会互相覆盖）。 */
  const longPressRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const cancelLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    startRef.current = null
  }
  return (
    <div
      ref={nodeRef}
      className="fixed left-0 top-0 select-none"
      style={{
        width: size,
        height,
        transform: `translate3d(${x}px, ${y}px, 0)`,
        // 位移走 CSS 过渡：一次设置、浏览器合成，不用逐帧改状态
        transition: !reducedMotion && transitionMs > 0 ? `transform ${transitionMs}ms linear` : undefined,
        zIndex: 'var(--z-pet)',
        willChange: 'transform',
        // 只让宠物矩形本身可点，别挡应用
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        onPointerDown={(e) => {
          drag.onPointerDown(e)
          if (e.button !== 0) return
          startRef.current = { x: e.clientX, y: e.clientY }
          cancelLongPress()
          longPressRef.current = window.setTimeout(() => {
            longPressRef.current = null
            onLongPress?.()
          }, LONG_PRESS_MS)
        }}
        onPointerMove={(e) => {
          drag.onPointerMove(e)
          const s = startRef.current
          if (s && Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > LONG_PRESS_SLOP) cancelLongPress()
        }}
        onPointerUp={(e) => {
          cancelLongPress()
          drag.onPointerUp(e)
        }}
        onPointerCancel={(e) => {
          cancelLongPress()
          drag.onPointerCancel(e)
        }}
        aria-label={`${name}（点击互动，可拖动）`}
        title={`${name}（点一下互动，可以拖着玩）`}
        className="block h-full w-full cursor-grab border-0 bg-transparent p-0 active:cursor-grabbing"
        // 触摸拖拽：不让浏览器把这段手势解释成滚动 / 缩放
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
      >
        <img
          // key 必须带 anim：不换 key 的话同一张动图不会从第一帧重播
          key={anim}
          src={src}
          alt={name}
          draggable={false}
          decoding="async"
          className={cn('h-full w-full object-contain', reducedMotion && 'transition-none')}
          style={{
            // 镜像用 scaleX，与位移同属 transform，不触发重排
            transform: facing === 'right' ? 'scaleX(-1)' : undefined,
          }}
        />
      </button>
    </div>
  )
})
