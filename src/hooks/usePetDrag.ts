/**
 * 桌宠 · 拖拽与抛掷（**指针 + 物理**那一路，与状态机那一路分开）
 *
 * ## 为什么单独成 hook
 * 桌宠有两套时间源，谁也别管谁：
 *  · **定时链 + 运动**（`usePetLoop`）：秒级的"该播什么动画 / 该走到哪"；
 *  · **指针与物理**（本文件）：帧级的跟手、惯性、落地。
 * 两者只在"谁拥有位置"这一件事上打交道 —— 也就是 `busyRef`（忙时定时链让位）
 * 与 `resume`（完事交还）。
 *
 * ## 位置的所有权（本文件的核心约定）
 *  · 空闲：`posRef` 由 `usePetLoop` 的运动循环写；
 *  · 拖拽 / 抛掷：**由本文件写**，同时直接写 DOM transform（`spriteRef`）——
 *    每帧 60 次 `setState` 会把整棵树带上渲染路径，而位移本质只动一个合成层；
 *  · 结束：`onSettle` 对齐最终位置并落一次**本机**存档（不进业务表）。
 *
 * ## 三种指针行为严格互斥（判定全部收口在 `services/pet/interaction`）
 *  · **点击**：按下后没超过 4px 就抬起 → 交给 click 处理，**绝不产生甩动**；
 *  · **长按**：按下后**原地**停够 500ms → 唤起菜单（移动端没有右键）；
 *  · **拖拽**：移动超过阈值 → 取消长按、跟手拖动，松手按最近位移甩出去。
 *
 * ⚠️ 这三者此前分散在组件与 hook 两处（各持一份 ref，且一个清空另一个刚设的起点），
 * 结果是"拖它也不取消长按，500ms 后照样弹菜单"。现在只有**这一处**状态机。
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { PetHost } from '../services/pet/adapter'
import { integrate, type PhysicsState } from '../services/pet/physics'
import { boundsOf } from '../services/pet/geometry'
import { draggingAnim } from '../services/pet/state-machine'
import {
  LONG_PRESS_MS,
  exceedsDragThreshold,
  resolveDragEnd,
  shouldCancelLongPress,
} from '../services/pet/interaction'
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
  /** 运行时实际尺寸（effectiveSize）—— 与运动共用同一份，避免第二套尺寸真相 */
  sizeRef: RefObject<number>
  /** 当前位置（px）—— 与调度器共用同一份，改一处即两边都动 */
  posRef: RefObject<{ x: number; y: number }>
  /** 宠物根节点：拖拽与抛掷阶段直接写它的 transform */
  spriteRef: RefObject<HTMLDivElement | null>
  /** 页面可见性（后台不推进物理） */
  visibleRef: RefObject<boolean>
  /** 开始拖拽：停掉状态机的定时链与运动循环（位置的主人是手指） */
  pause: () => void
  /** 结束拖拽 / 落地：把控制权交还状态机，`delayMs` 为下一拍延迟 */
  resume: (delayMs: number) => void
  /** 换动画（"被拎起来"的姿态）；`src` 由宿主解析 */
  setAnim: (anim: string, src: string) => void
  /** 落地：对齐最终位置并落一次本机存档 */
  onSettle: (x: number, y: number) => void
  /** 长按唤起菜单（移动端的右键等价操作） */
  onLongPress: () => void
  /** 打断当前运动并返回**真实位置**（按下与点击都要先调它，否则会瞬移） */
  settle: () => { x: number; y: number }
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

/** 拖拽期间最多保留多少个指针采样（估松手速度只用到最近 120ms） */
const MAX_SAMPLES = 12

export function usePetDrag(o: PetDragOptions): PetDrag {
  const {
    host,
    cfgRef,
    sizeRef,
    posRef,
    spriteRef,
    visibleRef,
    pause,
    resume,
    setAnim,
    onSettle,
    onLongPress,
    settle,
  } = o

  /** 拖拽中的指针会话（null = 没在拖）。`startX/startY` 是按下那一刻的指针位置，
   *  阈值判定与长按取消都用它作基准（必须用**累计位移**，不能用单帧增量）。 */
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    offX: number
    offY: number
    moved: boolean
    samples: { t: number; x: number; y: number }[]
  } | null>(null)
  /** 抛掷中的物理状态（null = 没在飞） */
  const throwRef = useRef<PhysicsState | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  /** 刚发生过拖拽 / 刚唤过菜单 → 抑制随后那次 click */
  const suppressClickRef = useRef(false)
  const busyRef = useRef(false)
  /** 长按计时器（唤起菜单用） */
  const longPressRef = useRef<{ timer: number | null }>({ timer: null })

  const setBusy = (v: boolean) => {
    busyRef.current = v
  }

  /** 清掉长按计时。**它只清计时器**，不碰拖拽会话 —— 两者混在一起正是旧版出问题的地方 */
  const clearLongPress = useCallback(() => {
    if (longPressRef.current.timer !== null) {
      window.clearTimeout(longPressRef.current.timer)
      longPressRef.current.timer = null
    }
  }, [])

  /** 直接写 transform：拖拽与抛掷每帧都改位置，走 React state 会把整棵树带上渲染路径 */
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
    // 卸载 / 重新抓住时也要清长按计时，免得卸载后还冒出一个菜单
    clearLongPress()
    setBusy(dragRef.current !== null)
  }, [clearLongPress])

  /**
   * 松手后的抛掷：rAF 积分到静止为止。
   *
   * 三条必须守住的：
   *  · **静止即停** —— 不停就是每帧空转（常驻物最不该有的开销）；
   *  · **后台不推进** —— 大 dt 由 `integrate` 夹住，切回来不会瞬移；
   *  · **落地才落本机存档** —— 飞行途中每帧写位置等于每秒 60 次写盘。
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
          // 边界每帧从宿主取：窗口在飞行途中变化时，宠物自己会撞墙收敛
          const { state, resting } = integrate(
            st,
            dt,
            c.physics,
            boundsOf(host.getViewport(), sizeRef.current),
          )
          throwRef.current = state
          posRef.current = { x: state.x, y: state.y }
          paint(state.x, state.y)
          if (resting) {
            throwRef.current = null
            setBusy(false)
            // onSettle 会再 paint 一次并对齐 posRef（含取整），这里不必重复
            onSettle(Math.round(state.x), Math.round(state.y))
            resume(c.tickMs.min)
            return
          }
        }
        rafRef.current = window.requestAnimationFrame(frame)
      }
      rafRef.current = window.requestAnimationFrame(frame)
    },
    [cfgRef, host, onSettle, paint, posRef, resume, sizeRef, visibleRef],
  )

  /**
   * 按下：夺取控制权（**先结算运动** → 停定时链 → 停抛掷），并起长按计时。
   */
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
      // ① 先把正在进行的漫游结算成**真实位置**，再夺取所有权：
      //    否则抓取偏移是按"终点"算的，宠物会在抓住的一瞬间跳到别处
      settle()
      pause()
      cancel()
      suppressClickRef.current = false
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offX: e.clientX - posRef.current.x,
        offY: e.clientY - posRef.current.y,
        moved: false,
        samples: [{ t: Date.now(), x: e.clientX, y: e.clientY }],
      }
      setBusy(true)
      // 换成"被拎起来"的动画（没配 events.dragging 就维持原样，不静默乱换）
      const anim = draggingAnim(cfgNow)
      if (anim) setAnim(anim, host.resolveAsset(anim))
      // ② 长按计时：**先清后设**。旧版是"先在组件里记下起点、再调取消函数"，
      //    而那个取消函数会把刚记的起点一起清成 null → 取消判据永远失效，
      //    于是**拖着它也会在 500ms 后弹出菜单**。现在起点只此一份。
      clearLongPress()
      longPressRef.current.timer = window.setTimeout(() => {
        longPressRef.current.timer = null
        // 唤菜单的同时抑制 click：否则关掉菜单的那一刻又"点"了它一下
        suppressClickRef.current = true
        onLongPress()
      }, LONG_PRESS_MS)
      // 阻止触摸拖拽带出页面滚动 / 长按选择
      e.preventDefault()
    },
    [cancel, cfgRef, clearLongPress, host, onLongPress, pause, posRef, setAnim, settle],
  )

  /**
   * 移动：1:1 跟手，但**夹在边界内** —— 拖出屏幕再松手，宠物就再也抓不回来了。
   * 同时负责取消长按：指针离按下点超过 8px 就说明"他是在拖它，不是要菜单"。
   */
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      // 判据一律用**按下点**作基准（累计位移），不用单帧增量
      if (shouldCancelLongPress({ x: d.startX, y: d.startY }, { x: e.clientX, y: e.clientY })) {
        clearLongPress()
      }
      const rawX = e.clientX - d.offX
      const rawY = e.clientY - d.offY
      const b = boundsOf(host.getViewport(), sizeRef.current)
      const x = Math.min(b.right, Math.max(b.left, rawX))
      const y = Math.min(b.bottom, Math.max(b.top, rawY))
      if (!d.moved && exceedsDragThreshold({ x: d.startX, y: d.startY }, { x: e.clientX, y: e.clientY })) {
        d.moved = true
      }
      posRef.current = { x, y }
      paint(x, y)
      d.samples.push({ t: Date.now(), x, y })
      if (d.samples.length > MAX_SAMPLES) d.samples.shift()
    },
    [clearLongPress, host, paint, posRef, sizeRef],
  )

  /**
   * 松手 / 被系统取消：三种结局由 `resolveDragEnd` 判定 ——
   * **只有真拖拽才甩**（短点击绝不产生可见甩动），被取消就原地停下交还状态机。
   */
  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      dragRef.current = null
      // 无论走哪条分支都要清长按计时 —— pointercancel 也一样
      clearLongPress()
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
      const outcome = resolveDragEnd({
        moved: d.moved,
        cancelled,
        samples: d.samples,
        now: Date.now(),
        throwPower: cfgNow.physics.throwPower,
      })
      if (outcome.kind === 'throw') {
        startThrow(outcome.vx, outcome.vy)
        return
      }
      // 点击 / 取消：**原地停下**并把控制权交还状态机（不甩）
      setBusy(false)
      onSettle(Math.round(posRef.current.x), Math.round(posRef.current.y))
      resume(cfgNow.tickMs.min)
    },
    [cfgRef, clearLongPress, onSettle, posRef, resume, startThrow],
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
