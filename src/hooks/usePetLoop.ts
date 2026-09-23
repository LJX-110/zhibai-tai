/**
 * 桌宠 · 循环调度器（**状态机那一路**的唯一驱动者）
 *
 * 三件事，各司其职：
 *  ① **定时链**：按状态机给出的 `until` 安排下一拍（`setTimeout`，不用 rAF ——
 *     决策是秒级的，用 rAF 白烧帧）；
 *  ② **位移交给 CSS 过渡**：进入 move 段时只把目标位置设一次，
 *     过渡时长 = 本段时长 → 全程只动 `transform`，不逐帧改状态（避免每帧重渲染）；
 *  ③ **卸载即停**：定时器与订阅在 cleanup 里全部清掉，不留孤儿。
 *
 * ⚠️ 三条纪律：
 *  · 页面不可见时**停掉定时链**（后台跑动画纯属耗电），回前台补一次决策；
 *  · `prefers-reduced-motion` 下不停循环，但状态机不会给出 move/turn（见 state-machine）；
 *  · 配置加载失败**显式上报**并停用桌宠，**绝不静默兜底** ——
 *    悄悄用内置默认值跑，表现为"宠物行为诡异但没人知道为什么"。
 *
 * ## 与 `usePetDrag` 的分工（2026-09-23 拆出）
 * 桌宠有两套时间源：**秒级的定时链**（本文件）与**帧级的指针/物理**（拖拽抛掷，见
 * `hooks/usePetDrag`）。两者只在"谁拥有位置"上打交道 —— 拖拽时本文件让位，
 * 落地后由对方 `resume` 交还。分成两个文件之后各自守住 400 行以内，也互不牵制。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { loadPetConfig } from '../services/pet/config'
import { createBrowserHost, type PetHost } from '../services/pet/adapter'
import { anchorPixel, clampToViewport } from '../services/pet/motion'
import {
  decide,
  initialRuntime,
  onPetClick,
  setExternalBusy,
  type DecideContext,
  type Facing,
  type PetRuntime,
} from '../services/pet/state-machine'
import type { PetConfig } from '../services/pet/types'
import { usePetStore } from '../stores/usePetStore'
import { recordError } from '../services/error-log'
import { usePetDrag, type PetDragHandlers } from './usePetDrag'
import { prefersReducedMotion } from '../utils/motion'

export interface PetView {
  /** 素材名（作为 `<img key>` 用：不换 key 同一张动图不会从第一帧重播） */
  anim: string
  /** 素材 URL —— **由宿主适配层解析**，渲染层不拼路径（P7 桌面壳会换成 file://） */
  src: string
  /** 落点（px，宠物包围盒左上角） */
  x: number
  y: number
  facing: Facing
  /** 本次位移的过渡时长（ms）；非位移段为 0（不产生无谓缓动） */
  transitionMs: number
}

export interface UsePetLoopResult {
  view: PetView | null
  /** 配置就绪且已定位 —— 渲染层据此决定要不要挂 DOM */
  ready: boolean
  onClick: () => void
  /** 外部忙闲注入口（天机联动那半仍是预留，见 state-machine 的说明） */
  setBusy: (busy: boolean) => void
  /**
   * 渲染层把它挂到宠物**根节点**上。拖拽抛掷阶段由 `usePetDrag` 直接写它的 `transform` ——
   * 每帧 60 次 `setState` 会把整棵树带上渲染路径，而位移本质只动一个合成层。
   */
  spriteRef: RefObject<HTMLDivElement | null>
  drag: PetDragHandlers
}

/**
 * ⚠️ 浏览器宿主必须**只建一次**（模块级单例）。
 * 写成 `usePetLoop(host = createBrowserHost())` 会让每次渲染都产生新对象 →
 * `apply` / `step` 的依赖每帧变化 → 起链的 effect 反复重建 →
 * **定时链永远跑到一半就被清掉，宠物表现为完全不动**。
 * 这个对象只是几个闭包，没有副作用，模块级创建是安全的。
 */
const BROWSER_HOST = createBrowserHost()

export function usePetLoop(host: PetHost = BROWSER_HOST): UsePetLoopResult {
  const [cfg, setCfg] = useState<PetConfig | null>(null)
  const [view, setView] = useState<PetView | null>(null)
  const [ready, setReady] = useState(false)

  const runtimeRef = useRef<PetRuntime | null>(null)
  /** 当前坐标（px）。放 ref 而不是读 state —— 决策时要用它算 cx，
   *  若从 state 读就得把 view 塞进各回调依赖，每次位移都会重建定时链。 */
  const posRef = useRef({ x: 0, y: 0 })
  const timerRef = useRef<number | null>(null)
  const visibleRef = useRef(true)
  const cfgRef = useRef<PetConfig | null>(null)
  /** 宠物根节点 —— 抛掷阶段由 `usePetDrag` 直接写它的 transform（不经 React 渲染） */
  const spriteRef = useRef<HTMLDivElement | null>(null)

  // ① 载入配置：失败显式上报 + 不上屏（不留一个"半死不活"的宠物）
  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    void loadPetConfig(ctrl.signal)
      .then((c) => {
        if (!alive) return
        cfgRef.current = c
        setCfg(c)
      })
      .catch((e: unknown) => {
        if (!alive) return
        recordError({
          kind: 'error',
          message: `桌宠配置加载失败：${e instanceof Error ? e.message : String(e)}`,

          where: 'pet/config',
        })
      })
    return () => {
      alive = false
      ctrl.abort()
    }
  }, [])

  /**
   * 把一次决策落到视图上；位置一律**先夹回视口**再写入 ——
   * 否则窗口变窄后宠物会停在屏外，而 planMove 此时两向都判越界、回退成转向，
   * 结果是**永久卡在屏幕外**（界面还显示"已开启"）。
   */
  const apply = useCallback(
    (next: PetRuntime, cfgNow: PetConfig, now: number, isFirst: boolean) => {
      const vp = host.getViewport()
      if (next.move) {
        posRef.current = {
          x: Math.round(next.move.to * vp.width),
          y: Math.round(next.move.yRatio * vp.height),
        }
      } else if (isFirst) {
        // 优先**恢复已存的位置**（刷新/换设备后回到原处）；没存过才落到配置角落
        const saved = usePetStore.getState()
        const hasSaved = saved.loaded && (saved.position.x !== 0 || saved.position.y !== 0)
        const base = hasSaved
          ? saved.position
          : anchorPixel({
              corner: cfgNow.position.corner,
              marginX: cfgNow.position.marginX,
              marginY: cfgNow.position.marginY,
              size: cfgNow.size,
              W: vp.width,
              H: vp.height,
            })
        posRef.current = { x: Math.round(base.x), y: Math.round(base.y) }
      }
      // 夹回视口：覆盖"存档越界"与"漫游算出界"两种可能
      posRef.current = clampToViewport({
        x: posRef.current.x,
        y: posRef.current.y,
        size: cfgNow.size,
        viewport: vp,
      })
      setView({
        anim: next.anim,
        src: host.resolveAsset(next.anim),
        x: posRef.current.x,
        y: posRef.current.y,
        facing: next.facing,
        transitionMs: next.move ? Math.max(0, next.until - now) : 0,
      })
      // 位置落库（store 内部已做节流，不会每次决策都写）
      void usePetStore.getState().setPosition(posRef.current.x, posRef.current.y)
    },
    [host],
  )

  /**
   * 「一次决策」放在 ref 里 —— 不能用自引用的 `step`：
   * 那样 React Compiler 会报 `immutability`（`step` is read during its own
   * initialization），而且严格模式下也容易踩到"回调先于定义执行"的时序坑。
   */
  const tickRef = useRef<() => void>(() => {})

  /** 排下一拍 */
  const step = useCallback((delayMs: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => tickRef.current(), Math.max(0, delayMs))
  }, [])

  /** 停掉定时链（拖拽期间状态机必须让位，否则它会和手指抢位置） */
  const pause = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** 拖拽姿态：直接换 `anim`（换 key 才会从第一帧重播，见 PetSprite） */
  const setDragAnim = useCallback(
    (anim: string, src: string) => {
      setView((v) => (v ? { ...v, anim, src, transitionMs: 0 } : v))
    },
    [],
  )

  /** 落地/取消：把最终位置对齐回 React state —— 否则下一次任何渲染都会让宠物跳回起点 */
  const onSettle = useCallback((x: number, y: number) => {
    setView((v) => (v ? { ...v, x, y, transitionMs: 0 } : v))
    void usePetStore.getState().setPosition(x, y)
  }, [])

  // 帧级那一路（拖拽 / 抛掷）：位置的所有权在它手上，这里只提供必要的读写口
  const petDrag = usePetDrag({
    host,
    cfgRef,
    posRef,
    spriteRef,
    visibleRef,
    pause,
    resume: step,
    setAnim: setDragAnim,
    onSettle,
  })
  const { busyRef, consumeClickSuppression, cancel: cancelDrag } = petDrag

  useEffect(() => {
    tickRef.current = () => {
      const cfgNow = cfgRef.current
      const prev = runtimeRef.current
      if (!cfgNow || !prev || !visibleRef.current) return
      // 拖拽 / 抛掷期间状态机**让位**：位置的主人是手指与物理，不是定时链
      if (busyRef.current) return
      const t = Date.now()
      const vp = host.getViewport()
      // 显式标注类型：漏字段时编译期就能发现，而不是等到运行时行为诡异
      const ctx: DecideContext = {
        now: t,
        roll: Math.random(),
        cx: posRef.current.x + cfgNow.size / 2,
        cy: posRef.current.y + ((cfgNow.size * 9) / 16) * 0.5,
        viewport: vp,
        reducedMotion: prefersReducedMotion(),
      }
      const next = decide(cfgNow, prev, ctx)
      runtimeRef.current = next
      apply(next, cfgNow, t, false)
      step(next.until - t)
    }
  }, [host, apply, step, busyRef])

  // ② 起链（配置就绪后）
  useEffect(() => {
    if (!cfg) return
    const now = Date.now()
    if (!runtimeRef.current) {
      runtimeRef.current = initialRuntime(cfg, now)
      apply(runtimeRef.current, cfg, now, true)
      setReady(true)
    }
    step(cfg.tickMs.min)

    const off = host.onVisibilityChanged((visible) => {
      visibleRef.current = visible
      // 回前台补一次：后台期间可能已跨过好几个节拍，不补就会"愣住"
      // （正在抛掷时这次 tick 会自己让位，落地时对方会重新排链）
      if (visible && runtimeRef.current) step(0)
    })
    return () => {
      off()
      pause()
      // 抛掷的 rAF 循环也必须清掉：不清就是"卸载后每帧还在跑"的孤儿循环
      cancelDrag()
    }
  }, [cfg, host, apply, step, pause, cancelDrag])

  /**
   * 视口变化（窗口缩放 / 手机旋屏）→ 把宠物夹回屏内。
   *
   * 不做这一步的话：宠物停在 x=1200 而视口缩到 600 时，`planMove` 两个方向都判越界、
   * 回退成"转向"（不产生位移）—— **宠物就此永久卡在屏幕外**，而设置里还写着"已开启"。
   */
  useEffect(() => {
    if (!cfg) return
    const onResize = () => {
      // 拖拽 / 抛掷期间不要在这里抢位置：抛掷的积分循环每帧都从宿主取新视口，
      // 自己会撞墙收敛；此时再 setView 一次反而会把 DOM 上的 transform 覆盖回旧值
      if (busyRef.current) return
      const vp = host.getViewport()
      const next = clampToViewport({ x: posRef.current.x, y: posRef.current.y, size: cfg.size, viewport: vp })
      if (next.x === posRef.current.x && next.y === posRef.current.y) return
      posRef.current = next
      // 瞬时归位，不做缓动（窗口缩放时飘过去很怪）
      setView((v) => (v ? { ...v, x: next.x, y: next.y, transitionMs: 0 } : v))
      void usePetStore.getState().setPosition(next.x, next.y)
    }
    window.addEventListener('resize', onResize)
    onResize() // 挂载即校正一次：存档可能来自更大的屏幕
    return () => window.removeEventListener('resize', onResize)
  }, [cfg, host, busyRef])

  /** 点击回应：抢断当前段，播完继续正常链 */
  const onClick = useCallback(() => {
    // 刚拖过就别再当成"点了一下"（拖完松手浏览器必然补一次 click）
    if (consumeClickSuppression()) return
    const cfgNow = cfgRef.current
    const prev = runtimeRef.current
    if (!cfgNow || !prev) return
    const t = Date.now()
    const next = onPetClick(cfgNow, prev, t, Math.random())
    runtimeRef.current = next
    apply(next, cfgNow, t, false)
    step(next.until - t)
  }, [apply, consumeClickSuppression, step])

  const setBusy = useCallback((busy: boolean) => {
    const prev = runtimeRef.current
    if (!prev) return
    runtimeRef.current = setExternalBusy(prev, busy)
  }, [])

  return {
    view,
    ready,
    onClick,
    setBusy,
    spriteRef,
    drag: petDrag.drag,
  }
}
