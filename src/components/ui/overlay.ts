/**
 * 弹层协调 —— 层级栈 + 模态层共用行为（Escape / 焦点 / 开合伴音）
 *
 * 背景一：Dialog / Sheet / CommandMenu 各自监听 window keydown 的 Escape，
 *   叠放时（如命令面板中打开「键盘速查」）一次 Esc 会同时关掉所有层。
 *   故模态层改为登记到「栈」：只有栈顶那层响应 Escape。
 * 背景二：Dialog 有焦点锁、Sheet 与 Inspector 什么都没有 —— 同一类浮层，
 *   键盘体验却各不相同。故把 Esc / 焦点进出 / Tab 循环收敛到 useModalLayer，
 *   三家共用一份实现，各自的定位差异留在各自的组件里。
 */
import { useEffect, useRef, type RefObject } from 'react'
import { playSound } from '../../services/sound'

/** 焦点循环候选（与 Dialog 原先的选择器一致，含无表单控件时的兜底由调用方补 tabIndex） */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/** 打开中的模态层，按打开顺序排列（栈顶 = 最后打开） */
let modalStack: object[] = []

/** 当前是否存在模态弹层（供非模态层判断是否让位） */
export function hasActiveOverlay(): boolean {
  return modalStack.length > 0
}

export interface ModalLayerOptions {
  open: boolean
  onClose: () => void
  /**
   * 模态层（默认 true）：登记层级栈、开合伴音、打开时焦点移入 / 关闭时归还、
   * Tab 锁在层内。
   * 传 false 用于「常驻非模态面板」（桌面 Inspector 侧栏）：既不夺焦点也不登记，
   * 只在自己上方没有模态层时响应 Escape —— 否则它会顶掉命令面板的 Esc。
   */
  modal?: boolean
}

/**
 * 弹层行为 hook。返回面板 ref：绑到浮层根节点上（该节点需可聚焦，如 tabIndex={-1}），
 * 焦点移入与 Tab 循环都以它为边界。
 */
export function useModalLayer({
  open,
  onClose,
  modal = true,
}: ModalLayerOptions): RefObject<HTMLDivElement | null> {
  const panelRef = useRef<HTMLDivElement>(null)
  // 每实例一个标识：登记/注销成对，嵌套时据此判断谁在栈顶
  const tokenRef = useRef<object>({})

  useEffect(() => {
    if (!open) return
    const token = tokenRef.current
    if (modal) {
      playSound('ui-open')
      modalStack.push(token)
    }
    const previous = document.activeElement as HTMLElement | null
    // 通过 portal 挂载的节点要到下一帧才在真实 DOM 里出现
    const raf = modal
      ? requestAnimationFrame(() => {
          const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
          ;(first ?? panelRef.current)?.focus()
        })
      : 0
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (!modal) return
      // 归还焦点：关闭后光标不该落在已被卸载的节点上
      previous?.focus?.()
      playSound('ui-close')
      modalStack = modalStack.filter((t) => t !== token)
    }
  }, [open, modal])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 只有栈顶响应：叠放时一次 Esc 只关最上面那层
        if (modal ? modalStack[modalStack.length - 1] === tokenRef.current : !hasActiveOverlay()) {
          onClose()
        }
        return
      }
      if (!modal || e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE), panel]
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, modal, onClose])

  return panelRef
}
