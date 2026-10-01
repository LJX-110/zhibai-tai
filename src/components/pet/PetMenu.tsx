/**
 * 桌宠菜单（**唯一形态**：右键 / 长按唤起的紧凑浮层）—— Step 5-3E 重设计、5-3F 定案
 *
 * ## 为什么统一用浮层（底部抽屉已被否决删除）
 * 桌面有指针，"贴着宠物弹一个小面板"最顺手，且不打断视线；
 * 移动端曾试过底部抽屉（`PetMenuSheet`），但抽屉离宠物太远、盖住大片页面，
 * 2026-10-01 用户拍板**统一回紧凑浮层**，抽屉组件已删。
 *
 * ## 交互约定
 *  · 触发：桌面 `contextmenu`（`PetSprite` 转发）；长按 500ms 同样有效（见 `usePetDrag`）；
 *  · 关闭：点外面 / Esc / 选完 —— 与全站弹层同一套（见 `ui/overlay`）；
 *  · 位置：贴着宠物上方，且**夹在视口内**（宠物在角落时菜单不能被裁掉）。
 */
import { useEffect, useRef } from 'react'
import { cn } from '../../utils/cn'
import { PET_MENU_DIVIDER_AT, PET_MENU_ITEMS, type PetMenuAction } from './menu-items'
import type { PetBounds } from '../../services/pet/types'

export interface PetMenuProps {
  open: boolean
  /** 宠物包围盒左上角（宿主矩形 px） */
  x: number
  y: number
  size: number
  /**
   * 宿主可活动边界 —— 用来把菜单夹回屏内。
   * ⚠️ 刻意**不读 `window.innerWidth`**：那是把"宿主"硬编码进组件，
   * 边界该由宿主提供（见 `services/pet/adapter.ts`），读 window 会绕过这层收口。
   */
  bounds: PetBounds
  /** 菜单头部那行（「相识 N 天 · 好感 N」） */
  meta: string
  onAction: (a: PetMenuAction) => void
  onClose: () => void
}

/** 菜单最小宽度与边距（夹回视口用） */
const MENU_W = 196
const MENU_MARGIN = 8

export function PetMenu({ open, x, y, size, bounds, meta, onAction, onClose }: PetMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // 点外面 / Esc 关闭 —— 与全站弹层同一套键盘约定
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  // 水平居中于宠物，并**夹回宿主矩形**（宠物贴边时菜单不能被裁掉）。
  const maxLeft = Math.max(MENU_MARGIN, bounds.right + size - MENU_W)
  const left = Math.min(Math.max(MENU_MARGIN, x + size / 2 - MENU_W / 2), maxLeft)
  // 贴在宠物上方（菜单自己用 translateY(-100%) 抬起），顶端不越出
  const top = Math.max(MENU_MARGIN, y - 8)

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="桌宠菜单"
      className="fixed z-[var(--z-overlay)] rounded-tile border border-line bg-paper p-1 shadow-float anim-enter-fast"
      style={{ left, top, width: MENU_W, transform: 'translateY(-100%)' }}
    >
      <div className="mb-1 border-b border-line px-2 pb-1.5 pt-1">
        {/* 字号例外：名字行 —— 菜单标题比条目小半档（它是标签不是动作） */}
        <b className="block text-[13px] text-ink">知白</b>
        {/* 字号例外：副标（相识 / 好感）—— 次要信息，必须明显小于条目 */}
        <span className="block text-[11.5px] text-ink-faint">{meta}</span>
      </div>

      {PET_MENU_ITEMS.map((it, i) => (
        <div key={it.key}>
          {i === PET_MENU_DIVIDER_AT && <div className="my-1 h-px bg-line" />}
          <button
            type="button"
            role="menuitem"
            title={it.desc}
            onClick={() => onAction(it.key)}
            className={cn(
              // 字号例外：菜单条目 —— 触控目标靠 padding 撑（≥32px 高），字号可略小于正文
              'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-nested',
              it.danger ? 'text-cinnabar' : 'text-ink',
            )}
          >
            <it.icon size={14} className={cn('shrink-0', it.danger ? 'text-cinnabar/80' : 'text-ink-muted')} />
            {it.label}
          </button>
        </div>
      ))}
    </div>
  )
}