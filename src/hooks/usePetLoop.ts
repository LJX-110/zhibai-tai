/**
 * 桌宠 · 循环调度器（**状态机那一路**的唯一驱动者）
 *
 * 两件事，各司其职：
 *  ① **定时链**：按状态机给出的 `until` 安排下一拍（`setTimeout`，不用 rAF ——
 *     决策是秒级的，用 rAF 白烧帧）；
 *  ② **把决策落到视图**：`move` 段交给 `usePetMovement` 起一段真实移动，
 *     其余段只换动画与朝向（低频，走 React）。
 *
 * 位置的持有、rAF 逐帧插值、打断收口、本机落盘都在 `usePetMovement` 那一层
 * （它自成体系）；本文件只管"什么时候该决定什么"。
 *
 * ⚠️ 三条纪律：
 *  · 页面不可见时**停掉定时链**（后台跑动画纯属耗电），回前台补一次决策；
 *  · `prefers-reduced-motion` 下不停循环，但状态机不会给出 move/turn（见 state-machine）；
 *  · 配置加载失败**显式上报**并停用桌宠，**绝不静默兜底** ——
 *    悄悄用内置默认值跑，表现为"宠物行为诡异但没人知道为什么"。
 *
 * ## 与 `usePetDrag` 的分工
 * 桌宠有两套时间源：**秒级的定时链**（本文件）与**帧级的指针/物理**（`usePetDrag`）。
 * 两者只在"谁拥有位置"上打交道 —— 拖拽时本文件让位，落地后由对方 `resume` 交还。
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
import { boundsOf, clampToBounds, effectiveSize, petHeight } from '../services/pet/geometry'
import { createMovement } from '../services/pet/runtime'
import {
  decide,
  initialRuntime,
  onPetClick,
  setExternalBusy,
  type DecideContext,
  type Facing,
  type PetRuntime,
} from '../services/pet/state-machine'
import type { PetBounds, PetConfig } from '../services/pet/types'
import { useSettingsStore } from '../stores/useSettingsStore'
import { recordError } from '../services/error-log'
import { usePetMovement } from './usePetMovement'
import { usePetDrag, type PetDragHandlers } from './usePetDrag'
import { prefersReducedMotion } from '../utils/motion'

export interface PetView {
  /** 素材名（作为 `<img key>` 用：不换 key 同一张动图不会从第一帧重播） */
  anim: string
  /** 素材 URL —— **由宿主适配层解析**，渲染层不拼路径（见 `services/pet/adapter.ts`） */
  src: string
  facing: Facing
}

export interface UsePetLoopResult {
  /**
   * React 只负责"长什么样"（动画 / 朝向）。
   * ⚠️ **位置不在里面** —— 它每帧由 rAF 直接写 DOM；走 state 会把整棵树带上
   * 渲染路径，而位移本质上只动一个合成层。
   */
  view: PetView | null
  /** 配置就绪且已定位 —— 渲染层据此决定要不要挂 DOM */
  ready: boolean
  /** 运行时实际尺寸（effectiveSize = baseSize × petScale），渲染与几何共用它 */
  size: number
  onClick: () => void
  /** 外部忙闲注入口（天机联动那半仍是预留，见 state-machine 的说明） */
  setBusy: (busy: boolean) => void
  /**
   * 读一次当前位置（px）。给**低频**消费者用：气泡与菜单在打开那一刻取一次即可 ——
   * 让它们每帧跟着走反而会在移动中"甩出去"。
   */
  getPosition: () => { x: number; y: number }
  /** 读一次宿主可活动边界（气泡 / 菜单夹回用，替代组件直接读 window） */
  getBounds: () => PetBounds
  /**
   * 渲染层把它挂到宠物**根节点**上。运动与抛掷阶段都由 hook 直接写它的 `transform`。
   */
  spriteRef: RefObject<HTMLDivElement | null>
  drag: PetDragHandlers
}

/**
 * ⚠️ 浏览器宿主必须**只建一次**（模块级单例）。
 * 写成 `usePetLoop(host = createBrowserHost())` 会让每次渲染都产生新对象 →
 * 依赖每帧变化 → 起链的 effect 反复重建 →
 * **定时链永远跑到一半就被清掉，宠物表现为完全不动**。
 * 这个对象只是几个闭包，没有副作用，模块级创建是安全的。
 */
const BROWSER_HOST = createBrowserHost()

export function usePetLoop(
  host: PetHost = BROWSER_HOST,
  onLongPress?: () => void,
): UsePetLoopResult {
  const [cfg, setCfg] = useState<PetConfig | null>(null)
  const [view, setView] = useState<PetView | null>(null)
  const [ready, setReady] = useState(false)
  /** 用户设备偏好：桌宠尺寸倍率。订阅它 → 改设置时尺寸自动跟着重渲染 */
  const petScale = useSettingsStore((s) => s.petScale)
  /**
   * 运行时实际尺寸（effectiveSize = baseSize × petScale）。
   * **在渲染期派生**（而不是 effect + setState）：它直接参与渲染
   * （Sprite / Bubble / Menu 的宽高都跟它走），派生更简单、也少一轮渲染。
   * rAF 与拖拽那两路走 `sizeRef`（在 effect 里同步 —— 渲染期写 ref 会被拦下）。
   */
  const size = cfg ? effectiveSize(cfg.size, petScale) : 0
  /**
   * 长按回调放 ref 里：调用方多半传内联箭头函数，写进依赖会让本 hook 的
   * callback 每次渲染都重建，进而把定时链打散。
   * ⚠️ 同步动作必须放在 effect 里 —— 渲染期访问 ref 会被 React Compiler 拦下。
   */
  const longPressRef = useRef<() => void>(() => {})
  useEffect(() => {
    longPressRef.current = onLongPress ?? (() => {})
  }, [onLongPress])

  /**
   * 位置那一层。**逐项解构、不要整个对象放进依赖** ——
   * 它每次渲染都返回新对象，整个塞进 `useEffect` 依赖会让起链的 effect 反复重建
   * （正是文件头警告的那个"宠物完全不动"的坑）。解构出来的成员都是稳定的 ref 或 useCallback。
   */
  const {
    posRef,
    spriteRef,
    paint,
    settle,
    start: startMovement,
    stop: stopMovement,
    placeInitial,
    settleAt,
    clampInto,
  } = usePetMovement(host)

  const runtimeRef = useRef<PetRuntime | null>(null)
  const timerRef = useRef<number | null>(null)
  const visibleRef = useRef(true)
  const cfgRef = useRef<PetConfig | null>(null)
  /** 运行时实际尺寸（effectiveSize）—— 几何与拖拽那两路共用 */
  const sizeRef = useRef(0)

  /**
   * 「一次决策」放进 ref —— 不能用自引用的 `step`：那样 React Compiler 会报
   * `immutability`（`step` is read during its own initialization），
   * 而且严格模式下也容易踩到"回调先于定义执行"的时序坑。
   */
  const tickRef = useRef<() => void>(() => {})

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

  /** 把派生出来的尺寸同步给 ref（rAF 与拖拽那两路读它；⚠️ 渲染期写 ref 会被拦下） */
  useEffect(() => {
    sizeRef.current = size
  }, [size])

  /**
   * 把一次决策落到视图上。
   *
   * · `move` 段 → 起一段真实移动（起点是**当前位置**，不是配置角落、更不是终点）；
   * · 其余段 → 只换动画与朝向（低频，走 React）。
   *
   * 目标点一律先**夹回边界**再用：窗口变窄后宠物可能停在边界外，而 `planMove`
   * 此时两向都判越界、回退成转向（不产生位移）→ **永久卡在屏外**，
   * 界面上还显示"桌宠已开启"。
   */
  const apply = useCallback(
    (next: PetRuntime, now: number) => {
      const { move } = next
      if (move) {
        const vp = host.getViewport()
        startMovement(
          createMovement({
            from: posRef.current,
            to: clampToBounds(
              { x: Math.round(move.to * vp.width), y: Math.round(move.yRatio * vp.height) },
              boundsOf(vp, sizeRef.current),
            ),
            startAt: now,
            duration: Math.max(0, next.until - now),
          }),
          // 一段走完立刻决策下一段（此前由 rAF 循环内部直接调 tickRef）
          () => tickRef.current(),
        )
      }
      setView({ anim: next.anim, src: host.resolveAsset(next.anim), facing: next.facing })
    },
    [host, startMovement, posRef],
  )

  /** 排下一拍 */
  const step = useCallback((delayMs: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => tickRef.current(), Math.max(0, delayMs))
  }, [])

  /**
   * 停掉定时链**与运动循环**（拖拽期间状态机与漫游都必须让位，
   * 否则它们会和手指抢位置）。
   */
  const pause = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    stopMovement()
  }, [stopMovement])

  /** 拖拽姿态：换 `anim`（换 key 才会从第一帧重播，见 PetSprite） */
  const setDragAnim = useCallback((anim: string, src: string) => {
    setView((v) => (v ? { ...v, anim, src } : v))
  }, [])

  // 帧级那一路（拖拽 / 抛掷）：位置的所有权在它手上，这里只提供必要的读写口
  const petDrag = usePetDrag({
    host,
    cfgRef,
    sizeRef,
    posRef,
    spriteRef,
    visibleRef,
    pause,
    resume: step,
    setAnim: setDragAnim,
    onSettle: settleAt,
    /** 长按：由指针那一路判定 —— 点击 / 长按 / 拖拽的互斥只在一处实现 */
    onLongPress: () => longPressRef.current(),
    /** 打断当前运动并给出真实位置（点击与拖拽都要先调它，否则会瞬移） */
    settle,
  })
  const { busyRef, consumeClickSuppression, cancel: cancelDrag } = petDrag

  useEffect(() => {
    tickRef.current = () => {
      const cfgNow = cfgRef.current
      const prev = runtimeRef.current
      if (!cfgNow || !prev || !visibleRef.current) return
      // 拖拽 / 抛掷期间状态机**让位**：位置的主人是手指与物理，不是定时链
      if (busyRef.current) return
      // 决策前先收口：万一还有残留运动，把它结算成真实位置再用
      const cur = settle()
      const t = Date.now()
      const vp = host.getViewport()
      const s = sizeRef.current
      // 显式标注类型：漏字段时编译期就能发现，而不是等到运行时行为诡异
      const ctx: DecideContext = {
        now: t,
        roll: Math.random(),
        cx: cur.x + s / 2,
        // 身体中心在 16:9 画布的中线（换算只在 geometry 里定义一次）
        cy: cur.y + petHeight(s) * 0.5,
        viewport: vp,
        size: s,
        reducedMotion: prefersReducedMotion(),
      }
      const next = decide(cfgNow, prev, ctx)
      runtimeRef.current = next
      apply(next, t)
      // move 段由 rAF 循环收尾（走完会回调 tickRef），其余段用定时器排下一拍
      if (!next.move) step(next.until - t)
    }
  }, [host, apply, step, busyRef, settle])

  // ② 起链（配置就绪后）
  useEffect(() => {
    if (!cfg) return
    let alive = true
    // 尺寸在渲染期派生（`size`），并由上面的 effect 同步进 `sizeRef` ——
    // 这里不重复计算：两个 effect 按声明顺序执行，起链时 sizeRef 一定是新值。
    const now = Date.now()
    if (!runtimeRef.current) {
      const first = initialRuntime(cfg, now)
      runtimeRef.current = first
      setView({ anim: first.anim, src: host.resolveAsset(first.anim), facing: first.facing })
      // 先落位（本机存档 → 旧字段 → 角落），再起链 —— 两者都在启动瞬间完成，无观感差异
      void placeInitial(cfg, sizeRef.current).then(() => {
        if (!alive) return
        setReady(true)
        step(cfg.tickMs.min)
      })
    }

    const off = host.onVisibilityChanged((visible) => {
      visibleRef.current = visible
      // 回前台补一次：后台期间可能已跨过好几个节拍，不补就会"愣住"
      // （正在抛掷时这次 tick 会自己让位，落地时对方会重新排链）
      if (visible && runtimeRef.current) step(0)
    })
    return () => {
      alive = false
      off()
      pause()
      // 抛掷的 rAF 循环也必须清掉：不清就是"卸载后每帧还在跑"的孤儿循环
      cancelDrag()
    }
  }, [cfg, host, placeInitial, step, pause, cancelDrag])

  /**
   * `ready` 之后立刻画一次真实位置。
   *
   * 为什么需要：首次落位发生在组件挂载**之前**（那时 `spriteRef` 还是 null，
   * paint 是空写）。少了这一步，宠物会停在 `translate3d(0,0,0)` —— 也就是左上角。
   */
  useEffect(() => {
    if (ready) paint(posRef.current.x, posRef.current.y)
  }, [ready, paint, posRef])

  /**
   * 宿主矩形变化（窗口缩放 / 手机旋屏）→ 把宠物夹回屏内。
   *
   * 不做这一步的话：宠物停在 x=1200 而矩形缩到 600 时，`planMove` 两个方向都判越界、
   * 回退成"转向"（不产生位移）—— **宠物就此永久卡在屏外**，而设置里还写着"已开启"。
   */
  useEffect(() => {
    if (!cfg) return
    const onResize = () => {
      // 拖拽 / 抛掷期间不在这里抢位置：抛掷的积分循环每帧都从宿主取新边界，
      // 自己会撞墙收敛；此时再写一次反而会把 DOM 上的 transform 覆盖回旧值
      if (busyRef.current) return
      clampInto(sizeRef.current)
    }
    window.addEventListener('resize', onResize)
    onResize() // 挂载即校正一次：本机存档可能来自更大的屏幕
    return () => window.removeEventListener('resize', onResize)
    // `size` 也在依赖里：用户调大尺寸后要立刻按新尺寸夹回（否则会越界）
  }, [cfg, busyRef, clampInto, size])

  /** 点击回应：**先结算运动**，再抢断当前段（否则会从补间中间态瞬移到终点） */
  const onClick = useCallback(() => {
    // 刚拖过 / 刚长按唤过菜单，就别再当成"点了一下"
    if (consumeClickSuppression()) return
    const cfgNow = cfgRef.current
    const prev = runtimeRef.current
    if (!cfgNow || !prev) return
    settle()
    const t = Date.now()
    const next = onPetClick(cfgNow, prev, t, Math.random())
    runtimeRef.current = next
    apply(next, t)
    step(next.until - t)
  }, [apply, consumeClickSuppression, step, settle])

  const setBusy = useCallback((busy: boolean) => {
    const prev = runtimeRef.current
    if (!prev) return
    runtimeRef.current = setExternalBusy(prev, busy)
  }, [])

  /**
   * 读一次当前位置 —— 给气泡 / 菜单这类**低频**消费者，它们不需要订阅。
   * 返回副本，免得调用方拿到内部对象后被就地改写。
   */
  const getPosition = useCallback(() => ({ ...posRef.current }), [posRef])

  /** 读一次宿主可活动边界（组件夹回用，替代直接读 `window`） */
  const getBounds = useCallback(() => boundsOf(host.getViewport(), sizeRef.current), [host])

  return {
    view,
    ready,
    size,
    onClick,
    setBusy,
    getPosition,
    getBounds,
    spriteRef,
    drag: petDrag.drag,
  }
}
