/**
 * 桌宠 · 渲染层
 *
 * 只做三件事：**定位（transform）、朝向（scaleX 镜像）、换动画（key 重挂载）**。
 *
 * ⚠️ **位置不由 React 管**（2026-09-27 改）：`transform` 从 style 里彻底移出，
 * 完全交给 hook 直接写 DOM —— 若走 React，任何一次无关渲染（换动画、气泡出现）
 * 都会用"上一次渲染时的旧位置"把 DOM 覆盖回去。
 * 本组件挂载后 hook 会立刻 paint 一次真实位置（`ready` 的 effect）。
 *
 * 交互：只有宠物自身的矩形可点（`pointer-events` 只在该矩形上开），
 * 否则一个 fixed 全屏层会挡住整个应用的点击。
 *
 * 指针事件**原样转发**给 hook，这里不做任何判断 —— 点击 / 长按 / 拖拽三者的互斥、
 * 阈值、跟手、夹回全在 `usePetDrag` + `services/pet/interaction`（可测）。
 * 渲染层越薄越好：长按判定曾因为在这里与拖拽层**各持一份 ref 且互相清空**而失效，
 * 表现为"拖它也不取消长按，500ms 后照样弹菜单"。
 */
import { memo } from 'react'
import { cn } from '../../utils/cn'
import { petHeight } from '../../services/pet/geometry'
import type { PetView } from '../../hooks/usePetLoop'
import type { PetDragHandlers } from '../../hooks/usePetDrag'

export interface PetSpriteProps extends PetView {
  /** 宠物显示边长（px；**effectiveSize**，高按 16:9 推） */
  size: number
  /** 显示名（悬浮提示） */
  name: string
  reducedMotion: boolean
  onClick: () => void
  /**
   * 打开菜单（Step 5-3D）：桌面**右键**与移动**长按**共用同一个入口。
   * 此前只有长按接了线，右键点它没有任何反应 —— 而 `PetMenu` 的文件头一直写着
   * "桌面 contextmenu"，行为与声明不符（用户报"菜单看不到了"）。
   */
  onMenu: () => void
  /** 由 hook 持有：运动与拖拽阶段都由它直接改这个节点的 transform */
  nodeRef: React.RefObject<HTMLDivElement | null>
  drag: PetDragHandlers
}

export const PetSprite = memo(function PetSprite({
  anim,
  src,
  facing,
  size,
  name,
  reducedMotion,
  onClick,
  onMenu,
  nodeRef,
  drag,
}: PetSpriteProps) {
  const height = petHeight(size)
  return (
    <div
      ref={nodeRef}
      // 稳定测试钩子：根节点的类名是通用的（fixed left-0 top-0），
      // 自动化验收要量"桌宠有没有压住内容"就必须有一个可辨标识
      data-pet-sprite=""
      className="fixed left-0 top-0 select-none"
      style={{
        width: size,
        height,
        // ⚠️ 刻意不写 transform：位置由 hook 每帧直接写 DOM（见文件头）
        zIndex: 'var(--z-pet)',
        willChange: 'transform',
        // 只让宠物矩形本身可点，别挡应用
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        // 桌面右键 = 打开菜单（移动端由长按承担，见 usePetDrag）。
        // preventDefault 是必须的：否则系统右键菜单会盖在宠物菜单上
        onContextMenu={(e) => {
          e.preventDefault()
          onMenu()
        }}
        aria-haspopup="menu"
        aria-label={`${name}（点击互动，可拖动，右键菜单）`}
        title={`${name}（点一下互动，可以拖着玩，右键菜单）`}
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
