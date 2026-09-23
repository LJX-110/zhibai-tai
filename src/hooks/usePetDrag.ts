/**
 * 桌宠 · 拖拽与抛掷（**指针 + 物理**那一路，与状态机那一路分开）
 *
 * ## 为什么单独成 hook
 * 桌宠有两套时间源，谁也别管谁：
 *  · **定时链**（`usePetLoop`）：秒级的"该播什么动画 / 该不该走动"；
 *  · **指针与物理**（本文件）：帧级的跟手、惯性、落地。
 * 合成一个文件后 `usePetLoop` 涨到 469 行、超了单文件 400 行的硬规则；
 * 而且这两路的耦合面其实很窄 —— 只有"谁拥有位置"这一件事要打招呼，
 * 也就是这里的 `busyRef`（忙的时候让定时链让位）与 `resume`（完事交还）。
 *
 * ## 位置的所有权（这是本文件的核心约定）
 *  · 空闲：`posRef` 由 `usePetLoop` 的决策写入；
 *  · 拖拽/抛掷：**由本文件写**，同时直接写 DOM transform（`spriteRef`）——
 *    每帧 60 次 `setState` 会把整棵树带上渲染路径，而位移本质只动一个合成层；
 *  · 结束：`onSettle` 把最终位置**对齐回 React state**，否则下一次任何渲染都会跳回去。
 *
 * ## 四条纪律（每条都对应一种用户能看见的毛病）
 *  · 松手才甩：没动过就当成一次点击（`DRAG_THRESHOLD`），并抑制随后那次 click；
 *  · 拖拽期间**夹在视口内**：拖出屏幕再松手，宠物就再也抓不回来了；
 *  · 静止即停 rAF：常驻物最不该有的就是空转；
 *  · 后台不推进物理：`integrate` 会把大 dt 夹住，所以切回来也不会瞬移。
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { PetHost } from '../services/pet/adapter'
import { boundsOf, integrate, throwVelocity, type PhysicsState } from '../services/pet/physics'
import { draggingAnim } from '../services/pet/state-machine'
import type { PetConfig } from '../services/pet/types'

/** 拖拽指针事件（渲染层原样转发，逻辑全在这里） */
export interface PetDragHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
}

export interface PetDragOptions {
  host: PetHost
  cfgRef: RefObject<PetConfig | null>
  /** 当前位置（px）—— 与调度器共用同一份，改一处即两边都动 */
  posRef: RefObject<{ x: number; y: number }>
  /** 宠物根节点：抛掷阶段直接写它的 transform */
  spriteRef: RefObject<HTMLDivElement | null>
  /** 页面可见性（后台不推进物理） */
  visibleRef: RefObject<boolean>
  /** 开始拖拽：停掉状态机的定时链（位置的主人是手指，不是定时链） */
  pause: () => void
  /** 结束拖拽 / 落地：把控制权交还状态机，`delayMs` 为下一拍延迟 */
  resume: (delayMs: number) => void
  /** 换动画（"被拎起来"的姿态）；`src` 由宿主解析 */
  setAnim: (anim: string, src: string) => void
  /** 落地：把最终位置对齐回 React state 并落库 */
  onSettle: (x: number, y: number) => void
}

export interface PetDrag {
  drag: PetDragHandlers
  /** true = 拖拽或抛掷中（状态机与 resize 校正都必须让位） */
  busyRef: RefObject<boolean>
  /** 取用"抑制这次 click"标记（拖完松手浏览器必然补一次 click） */
  consumeClickSuppression: () => boolean
  /** 卸载 / 取消：停掉 rAF 循环（不清就是"卸载后每帧还在跑"的孤儿） */
  cancel: () => void
}

/** 判定"这是一次拖拽而不是点击"的位移阈值（px） */
const DRAG_THRESHOLD = 4
/** 拖拽期间最多保留多少个指针采样（估松手速度只用到最近 120ms） */
const MAX_SAMPLES = 12

export function usePetDrag(o: PetDragOptions): PetDrag {
  const { host, cfgRef, posRef, spriteRef, visibleRef, pause, resume, setAnim, onSettle } = o

  /** 拖拽中的指针会话（null = 没在拖） */
  const dragRef = useRef<{
    pointerId: number
    offX: number
    offY: number
    moved: boolean
    samples: { t: number; x: number; y: number }[]
  } | null>(null)
  /** 抛掷中的物理状态（null = 没在飞） */
  const throwRef = useRef<PhysicsState | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  /** 刚发生过拖拽 → 抑制随后那次 click */
  const suppressClickRef = useRef(false)
  const busyRef = useRef(false)

  const setBusy = (v: boolean) => {
    busyRef.current = v
  }

  /** 直接写 transform：抛掷每帧都改位置，走 React state 会把整棵树带上渲染路径 */
  const paint = useCallback(
    (x: number, y: number) => {
      const el = spriteRef.current
      if (el) el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
    },
    [spriteRef],
  )

  /** 停掉抛掷（再次抓住、或卸载） */
  const cancel = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    throwRef.current = null
    setBusy(dragRef.current !== null)
  }, [])

  /**
   * 松手后的抛掷：rAF 积分到静止为止。
   *
   * 三条必须守住的：
   *  · **静止即停** —— 不停就是每帧空转（常驻物最不该有的开销）；
   *  · **后台不推进** —— 大 dt 由 `integrate` 夹住，切回来不会瞬移；
   *  · **落地才落库** —— 飞行途中每帧写位置等于每秒 60 次写库（store 有节流也白搭）。
   */
  const startThrow = useCallback(
    (vx: number, vy: number) => {
      const cfgNow = cfgRef.current
      if (!cfgNow) return
      throwRef.current = { x: posRef.current.x, y: posRef.current.y, vx, vy }
      setBusy(true)
      lastFrameRef.current = performance.now()
      const frame = (now: number) => {
        const c = cfgRef.current
        const st = throwRef.current
        if (!c || !st) return
        const dt = (now - lastFrameRef.current) / 1000
        lastFrameRef.current = now
        if (visibleRef.current) {
          const { state, resting } = integrate(st, dt, c.physics, boundsOf(c.size, host.getViewport()))
          throwRef.current = state
          posRef.current = { x: state.x, y: state.y }
          paint(state.x, state.y)
          if (resting) {
            throwRef.current = null
            const fx = Math.round(state.x)
            const fy = Math.round(state.y)
            posRef.current = { x: fx, y: fy }
            setBusy(false)
            onSettle(fx, fy)
            resume(c.tickMs.min)
            return
          }
        }
        rafRef.current = window.requestAnimationFrame(frame)
      }
      rafRef.current = window.requestAnimationFrame(frame)
    },
    [cfgRef, host, onSettle, paint, posRef, resume, visibleRef],
  )

  /** 按下：夺取控制权（停状态机 + 停抛掷） */
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const cfgNow = cfgRef.current
      if (!cfgNow) return
      // 只认主键 / 单指：右键与多指不参与拖拽
      if (e.button !== 0) return
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // 个别环境不支持指针捕获 —— 退化成普通拖拽（手指移出宠物矩形就会断），不致命
      }
      pause()
      cancel()
      suppressClickRef.current = false
      dragRef.current = {
        pointerId: e.pointerId,
        offX: e.clientX - posRef.current.x,
        offY: e.clientY - posRef.current.y,
        moved: false,
        samples: [{ t: Date.now(), x: e.clientX, y: e.clientY }],
      }
      setBusy(true)
      // 换成"被拎起来"的动画（没配 events.dragging 就维持原样，不静默乱换）
      const anim = draggingAnim(cfgNow)
      if (anim) setAnim(anim, host.resolveAsset(anim))
      // 阻止触摸拖拽带出页面滚动 / 长按选择
      e.preventDefault()
    },
    [cancel, cfgRef, host, pause, posRef, setAnim],
  )

  /** 移动：1:1 跟手，但**夹在视口内** —— 拖出屏幕再松手，宠物就再也抓不回来了 */
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current
      const cfgNow = cfgRef.current
      if (!d || d.pointerId !== e.pointerId || !cfgNow) return
      const rawX = e.clientX - d.offX
      const rawY = e.clientY - d.offY
      const b = boundsOf(cfgNow.size, host.getViewport())
      const x = Math.min(b.maxX, Math.max(b.minX, rawX))
      const y = Math.min(b.maxY, Math.max(b.minY, rawY))
      if (!d.moved && Math.abs(rawX - posRef.current.x) + Math.abs(rawY - posRef.current.y) > DRAG_THRESHOLD) {
        d.moved = true
      }
      posRef.current = { x, y }
      paint(x, y)
      d.samples.push({ t: Date.now(), x, y })
      if (d.samples.length > MAX_SAMPLES) d.samples.shift()
    },
    [cfgRef, host, paint, posRef],
  )

  /** 松手：按最近 120ms 的位移甩出去；没动过就当作一次点击 */
  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* 没捕获成功时释放会抛，忽略 */
      }
      const cfgNow = cfgRef.current
      if (!cfgNow) {
        setBusy(false)
        return
      }
      if (d.moved) suppressClickRef.current = true
      if (cancelled) {
        // 被系统取消（来电、手势中断…）：原地停下并交还状态机，不甩
        setBusy(false)
        onSettle(Math.round(posRef.current.x), Math.round(posRef.current.y))
        resume(cfgNow.tickMs.min)
        return
      }
      const { vx, vy } = throwVelocity(d.samples, Date.now(), cfgNow.physics.throwPower)
      startThrow(vx, vy)
    },
    [cfgRef, onSettle, posRef, resume, startThrow],
  )

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => endDrag(e, false), [endDrag])
  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLElement>) => endDrag(e, true), [endDrag])

  const consumeClickSuppression = useCallback(() => {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }, [])

  return {
    drag: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    busyRef,
    consumeClickSuppression,
    cancel,
  }
}
