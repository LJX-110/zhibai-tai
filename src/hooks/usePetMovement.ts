/**
 * 桌宠 · 位置与运动（**位置真相**的唯一持有者）
 *
 * ## 为什么单独成 hook
 * `usePetLoop` 已经顶到单文件 400 行上限（`check:rules` 规则 1），而这里装的是
 * 一整套自成体系的东西：**位置怎么存、怎么按时间算、被打断时怎么收口、怎么落盘**。
 * 它与"该播什么动画 / 下一拍什么时候"（留在 `usePetLoop`）是两件事 ——
 * 抽出来之后两边都只做自己那一半。
 *
 * ## 位置真相：任何时刻都是「当前」坐标
 * 一次移动开始后，`posRef` **不再等于终点**，而是每帧按时间插值出来的真实位置。
 * 于是任何打断（点击 / 拖拽 / resize）都能从"眼睛看到的那一点"继续 ——
 * 此前的做法是移动一开始就把 `posRef` 写成终点、视觉交给 CSS transition 补间，
 * 结果三者中任意一个打断都会让画面**瞬移**（详见 `services/pet/runtime` 的文件头）。
 *
 * ## 三条结论性的约定
 *  · **位置是设备级状态**：只写 DOM 与宿主本机存档，**绝不进业务表、不触发同步**
 *    （它每几秒就变，写业务表会把同步链路的脏标记刷爆）；
 *  · **rAF 只在有移动时跑**，走完立刻停 —— 常驻物最不该有的就是空转；
 *  · **每帧只写 DOM transform**，不走 React state（60fps 的 setState 会把整棵树带上渲染路径）。
 */
import { useCallback, useRef, type RefObject } from 'react'
import type { PetHost } from '../services/pet/adapter'
import { anchorOf, boundsOf, clampToBounds } from '../services/pet/geometry'
import {
  isMovementDone,
  positionAt,
  resolveInitialPosition,
  usableLegacyPosition,
  type Movement,
} from '../services/pet/runtime'
import type { PetConfig } from '../services/pet/types'

export interface PetMovement {
  /**
   * 当前真实位置（px）。与拖拽那一路**共用同一份** —— 谁写谁读都只有这一个来源，
   * 所以"手指拖着走"与"自己在漫游"永远看不到对方过期的坐标。
   */
  posRef: RefObject<{ x: number; y: number }>
  /** 宠物根节点。运动与抛掷都由 hook 直接写它的 `transform`（不经 React 渲染） */
  spriteRef: RefObject<HTMLDivElement | null>
  /** 写一次 DOM transform */
  paint: (x: number, y: number) => void
  /**
   * **打断前的收口**：若正在走动，先按当前时间算出真实位置并停掉 rAF，
   * 让 `posRef` 就是"眼睛看到的那一点"。返回收口后的坐标。
   */
  settle: () => { x: number; y: number }
  /** 起一段移动；`onDone` 在走完那一刻回调（调用方据此立刻决策下一段） */
  start: (m: Movement, onDone: () => void) => void
  /** 停掉 rAF 循环（**不动定时链** —— 那条链归 `usePetLoop`） */
  stop: () => void
  /** 首次落位：本机存档 → 旧字段（legacy 迁移）→ 配置角落，三选一；并落一次本机存档 */
  placeInitial: (cfg: PetConfig, size: number) => Promise<void>
  /** 落地对齐（拖拽 / 抛掷结束时用）：写 posRef + DOM + 本机存档 */
  settleAt: (x: number, y: number) => void
  /** 把宠物夹回宿主矩形内（resize / 尺寸变化时调；内部先 settle 再夹） */
  clampInto: (size: number) => void
}

export function usePetMovement(host: PetHost): PetMovement {
  const posRef = useRef({ x: 0, y: 0 })
  /** 正在进行的移动（null = 没在走动）—— **打断时靠它算出真实位置** */
  const movementRef = useRef<Movement | null>(null)
  /** 移动用的 rAF 句柄 */
  const rafRef = useRef<number | null>(null)
  /** 宠物根节点 —— 运动与抛掷阶段都由 hook 直接写它的 transform */
  const spriteRef = useRef<HTMLDivElement | null>(null)

  /** 直接写 DOM transform：位移本质上只动一个合成层，不该走 React 渲染 */
  const paint = useCallback((x: number, y: number) => {
    const el = spriteRef.current
    if (el) el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  }, [])

  const settle = useCallback((): { x: number; y: number } => {
    const m = movementRef.current
    if (m) {
      const p = positionAt(m, Date.now())
      posRef.current = { x: Math.round(p.x), y: Math.round(p.y) }
      movementRef.current = null
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    return posRef.current
  }, [])

  const start = useCallback(
    (m: Movement, onDone: () => void) => {
      movementRef.current = m
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      const frame = () => {
        const cur = movementRef.current
        if (!cur) {
          rafRef.current = null
          return
        }
        const now = Date.now()
        const p = positionAt(cur, now)
        posRef.current = { x: Math.round(p.x), y: Math.round(p.y) }
        paint(posRef.current.x, posRef.current.y)
        if (isMovementDone(cur, now)) {
          movementRef.current = null
          rafRef.current = null
          // 一段走完才写一次本机存档（低频；**绝不进业务表**）
          host.persistLocalPosition(posRef.current)
          onDone()
          return
        }
        rafRef.current = window.requestAnimationFrame(frame)
      }
      rafRef.current = window.requestAnimationFrame(frame)
    },
    [host, paint],
  )

  const stop = useCallback(() => {
    movementRef.current = null
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  /**
   * 首次落位。
   *
   * 顺序即语义（见 `runtime.ts` 的 `resolveInitialPosition`）：位置是设备级状态、
   * 换设备不跟随；**旧字段只读一次、之后不再写**（见 `PetState.position` 的 deprecated 说明）。
   * 只有"本机没存过"时才去读旧字段 —— 免得每次启动都多读一次业务表。
   */
  const placeInitial = useCallback(
    async (cfg: PetConfig, size: number) => {
      const vp = host.getViewport()
      const local = host.loadLocalPosition()
      const legacy = local ? null : usableLegacyPosition((await host.load())?.position)
      const anchor = anchorOf({
        rect: vp,
        corner: cfg.position.corner,
        marginX: cfg.position.marginX,
        marginY: cfg.position.marginY,
        size,
      })
      const { position, fromLegacy } = resolveInitialPosition({ local, legacy, anchor })
      posRef.current = clampToBounds(position, boundsOf(vp, size))
      paint(posRef.current.x, posRef.current.y)
      // 用过旧字段或角落锚点 → 落一次本机存档（完成迁移，并保证下次启动一致）
      if (fromLegacy) host.persistLocalPosition(posRef.current)
    },
    [host, paint],
  )

  const settleAt = useCallback(
    (x: number, y: number) => {
      posRef.current = { x, y }
      paint(x, y)
      host.persistLocalPosition({ x, y })
    },
    [host, paint],
  )

  const clampInto = useCallback(
    (size: number) => {
      // 先结算当前运动 —— 否则夹的是"终点"，与眼睛看到的位置对不上
      const cur = settle()
      const next = clampToBounds(cur, boundsOf(host.getViewport(), size))
      if (next.x === cur.x && next.y === cur.y) return
      posRef.current = next
      // 瞬时归位，不做缓动（窗口缩放时飘过去很怪）
      paint(next.x, next.y)
      host.persistLocalPosition(next)
    },
    [host, settle, paint],
  )

  return { posRef, spriteRef, paint, settle, start, stop, placeInitial, settleAt, clampInto }
}
