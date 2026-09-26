/**
 * 桌宠菜单（P5） —— 右键（桌面）/ 长按（移动）
 *
 * ## 条目为什么只有这 5 条
 * 通用桌宠菜单会塞进"换装 / 皮肤 / 喂食 / 设置面板"那一整套 ——
 * 那是**把宠物做成游戏**，不是本项目的定位（见 `docs/方案与实现.md` §3.1）。
 * 这里只放**应用内动作**：能把你直接送到知白台的某件事上，其余一律不做。
 *
 * ## 交互约定
 *  · 触发：桌面 `contextmenu`；移动 `pointerdown` 后 500ms 未抬起（长按）；
 *  · 关闭：点外面 / Esc / 选完 —— 与全站弹层同一套（见 `ui/overlay`）；
 *  · 位置：贴着宠物上方，且**夹在视口内**（宠物在角落时菜单不能被裁掉）。
 */
import { useEffect, useRef } from 'react'
import { PERSONA as P } from '../../services/pet/persona'
import { cn } from '../../utils/cn'

export type PetMenuAction = 'seclusion' | 'quick' | 'today' | 'hush' | 'off'

export interface PetMenuProps {
  open: boolean
  /** 宠物包围盒左上角（视口 px） */
  x: number
  y: number
  size: number
  /** 菜单头部那行（「相识 N 天 · 好感 N」） */
  meta: string
  /** 点名字 = 戳它一下 —— 它会顶一句（人格特质 `TRAIT_NOT_FAT_REFUSE` 的出口） */
  onPoke?: () => void
  onAction: (a: PetMenuAction) => void
  onClose: () => void
}

/** 菜单最小宽度与边距（夹回视口用） */
const MENU_W = 186
const MENU_MARGIN = 8

export function PetMenu({ open, x, y, size, meta, onPoke, onAction, onClose }: PetMenuProps) {
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

  const left = Math.min(
    Math.max(MENU_MARGIN, x + size / 2 - MENU_W / 2),
    Math.max(MENU_MARGIN, window.innerWidth - MENU_W - MENU_MARGIN),
  )
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
        <button
          type="button"
          onClick={() => onPoke?.()}
          className="-mx-1 block w-[calc(100%+0.5rem)] rounded-control px-1 text-left"
          aria-label="戳一下知白"
        >
          {/* 字号例外：菜单头部的名字 —— 比条目字号小半档，它是标题不是动作 */}
          <b className="block text-[13px] text-ink">{P.name}</b>
        </button>
        {/* 字号例外：副标（相识 / 好感）—— 次要信息，必须明显小于条目 */}
        <span className="block text-[11.5px] text-ink-faint">{meta}</span>
      </div>

      <MenuItem icon="◉" label="开始一次闭关" onClick={() => onAction('seclusion')} />
      <MenuItem icon="＋" label="记一笔" onClick={() => onAction('quick')} />
      <MenuItem icon="◎" label="看今日" onClick={() => onAction('today')} />
      <div className="my-1 h-px bg-line" />
      <MenuItem icon="☾" label="安静一小时" onClick={() => onAction('hush')} />
      <MenuItem icon="✕" label="关掉桌宠" tone="danger" onClick={() => onAction('off')} />
    </div>
  )
}

function MenuItem({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: string
  label: string
  tone?: 'danger'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        // 字号例外：菜单条目 —— 触控目标靠 padding 撑（≥32px 高），字号可略小于正文
        'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-nested',
        tone === 'danger' ? 'text-cinnabar' : 'text-ink',
      )}
    >
      <span className="w-3.5 shrink-0 text-center text-ink-muted">{icon}</span>
      {label}
    </button>
  )
}
