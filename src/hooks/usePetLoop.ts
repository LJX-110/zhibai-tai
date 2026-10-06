/**
 * 桌宠 · 循环调度器（**状态机那一路**的唯一驱动者）
 *
 * 两件事：① **定时链**（按状态机的 `until` 排下一拍，`setTimeout` 而非 rAF —— 决策是秒级的）；
 * ② **把决策落到视图**（`move` 段交给 `usePetMovement`，其余段只换动画与朝向）。
 *
 * 分工：位置 / rAF 插值 / 打断收口 / 本机落盘在 `usePetMovement`；**视图帧与重播序号在
 * `usePetView`**；真实应用状态在 `usePetWorld`；指针那一路在 `usePetDrag`。
 * ⚠️ 纪律：不可见时停链（回前台补一拍）；reduced-motion 下不给 move/turn；
 * **配置加载失败显式上报并停用**（绝不静默兜底）；**落位前不做位置校正**（理由见 resize effect，B7 实测）。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createBrowserHost, type PetHost } from '../services/pet/adapter'
import { findPlayable } from '../services/pet/animation-catalog'
import { IDLE_SESSION_LIMIT, idleEraNames, markIdleLoaded } from '../services/pet/idle-pool'
import { boundsOf, clampToBounds, effectiveSize, nearestPetScale, petHeight } from '../services/pet/geometry'
import { createMovement } from '../services/pet/runtime'
import {
  decide,
  initialRuntime,
  onPetClick,
  type DecideContext,
  type PetRuntime,
} from '../services/pet/state-machine'
import type { PetBounds } from '../services/pet/types'
import { useSettingsStore } from '../stores/useSettingsStore'
import { describeThrown, recordError } from '../services/error-log'
import { usePetMovement } from './usePetMovement'
import { usePetDrag, type PetDragHandlers } from './usePetDrag'
import { usePetWorld } from './usePetWorld'
import { usePetConfig } from './usePetConfig'
import { usePetReset } from './usePetReset'
import { usePetView, type PetView } from './usePetView'
import { prefersReducedMotion } from '../utils/motion'

/** 视图帧类型住在 `usePetView`；这里转出给渲染层（`PetSprite` 从本模块取） */
export type { PetView } from './usePetView'

export interface UsePetLoopResult {
  /** React 只负责"长什么样"。⚠️ **位置不在里面**（每帧由 rAF 直写 DOM，不走 state） */
  view: PetView | null
  /** 配置就绪且已定位 —— 渲染层据此决定要不要挂 DOM */
  ready: boolean
  /** 运行时实际尺寸（effectiveSize = baseSize × petScale），渲染与几何共用它 */
  size: number
  onClick: () => void
  /** 读一次当前位置（低频消费者用；不订阅 → 移动中不会跟着"甩出去"） */
  getPosition: () => { x: number; y: number }
  /** 读一次宿主可活动边界（气泡 / 菜单夹回用，替代组件直接读 window） */
  getBounds: () => PetBounds
  /** **恢复默认位置**：强制回角落锚点（忽略本机存档）；由设置页经 `commands` 触发 */
  resetPosition: () => void
  /** 立刻播指定动作（Step 5-3E；设置页「动作」列表 / 菜单的命令出口） */
  playOnce: (name: string) => void
  /**
   * 渲染层把它挂到宠物**根节点**上。运动与抛掷阶段都由 hook 直接写它的 `transform`。
   */
  spriteRef: RefObject<HTMLDivElement | null>
  drag: PetDragHandlers
  /**
   * **首屏要预热的素材名**（待机池 + 点击应答池，从配置派生 —— Step 4-3 · 九）。
   * 名单与 `config.json` 同源（由 hook 给出，渲染层不写死）；⚠️ 只拉这几张，不是全部。
   */
  warmup: string[]
}

/** ⚠️ 宿主必须模块级单例：写成默认参数会让每次渲染产生新对象 → 起链 effect 反复重建
 *  → 定时链被清掉（"宠物完全不动"的老坑）。它只是几个闭包，模块级创建安全。 */
const BROWSER_HOST = createBrowserHost()

/** 「立刻播一个动作」插播段的时长（ms）—— 与闲置小动作同档（`MS.event` 的观感） */
const PLAY_ONCE_MS = 2400

export function usePetLoop(
  host: PetHost = BROWSER_HOST,
  onLongPress?: () => void,
  /** 庆祝窗口截止时刻（ms）—— 由「重要完成」点亮，见 `services/completion.ts` */
  celebrateUntil = 0,
): UsePetLoopResult {
  // 配置载入 + 派生（cfg / cfgRef / 首屏预热名单）——Step 5-1 · E5 拆出独立模块
  const { cfg, cfgRef, warmup } = usePetConfig()
  // 视图帧（素材 / 朝向 / 重播序号）—— 见 usePetView；重播规则只有那一处
  const { view, show, init, setDrag } = usePetView()
  const [ready, setReady] = useState(false)
  /** 用户设备偏好：桌宠尺寸倍率。订阅它 → 改设置时尺寸自动跟着重渲染 */
  const petScale = useSettingsStore((s) => s.petScale)
  /** 真实应用状态：桌宠"看到的世界"（订阅式字段供"状态一变立刻重算"；`read()` 供定时链取上下文） */
  const { agent: agentPhase, focusing, wander, read: readWorld } = usePetWorld(celebrateUntil)
  /** 运行时尺寸（effectiveSize = baseSize × petScale；**渲染期派生**，少一轮渲染）。
   *  rAF 与拖拽那两路走下方 `sizeRef`（渲染期写 ref 会被拦下）。 */
  // 尺寸经**档位吸附**（老用户的连续值落到最近档；纯函数，每次渲染都确定）
  const size = cfg ? effectiveSize(cfg.size, nearestPetScale(petScale)) : 0
  /** 长按回调放 ref（调用方多半传内联函数，写进依赖会打散定时链）；同步放 effect */
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
    resetPosition: resetPositionOf,
  } = usePetMovement(host)

  const runtimeRef = useRef<PetRuntime | null>(null)
  const timerRef = useRef<number | null>(null)
  const visibleRef = useRef(true)
  /** 运行时实际尺寸（effectiveSize）—— 几何与拖拽那两路共用 */
  const sizeRef = useRef(0)
  /**
   * 本会话**已加载过的 idle 闲暇素材**（Step 5-1 · E1）。只作只读视图交给状态机"缩小候选池"，
   * **不拦 `resolveAsset`**（拦了会出现"想播的动画播不出来"＝静默定帧）；
   * 到 20 个之后状态机只会从这批里挑，"不再新增下载"因此是构造出来的。
   */
  const loadedIdleRef = useRef<Set<string>>(new Set())
  // 恢复默认位置（设置页经 commands.ts 触发）——抽在 usePetReset 里：属"命令处理"，不属决策循环
  const resetPosition = usePetReset(cfgRef, sizeRef, resetPositionOf)

  /** 「一次决策」放进 ref —— 不能用自引用的 `step`（React Compiler 报 `immutability`） */
  const tickRef = useRef<() => void>(() => {})

  /** 把派生出来的尺寸同步给 ref（rAF 与拖拽那两路读它；⚠️ 渲染期写 ref 会被拦下） */
  useEffect(() => {
    sizeRef.current = size
  }, [size])

  /** 漫游开关走 ref：赋值 effect 不能依赖它（会打散定时链），
      直接在 tick 里读闭包变量只会拿到首帧旧值（用户打开漫游不生效的老坑） */
  const wanderRef = useRef(wander)
  useEffect(() => {
    wanderRef.current = wander
  }, [wander])

  /** 一次决策落到视图：`move` 段起真实移动，其余段只换动画与朝向。⚠️ 目标点先**夹回边界**
   *  （窗口变窄后两向都越界 → 回退转向不产生位移 → 永久卡屏外）。 */
  const apply = useCallback(
    (next: PetRuntime, now: number) => {
      const { move } = next
      if (move) {
        const vp = host.getViewport()
        // move 的比例是**活动矩形内**的局部比例：换算回绝对坐标要加原点；
        // y 用**当前值**（水平移动，见 state-machine 的 move 注释）
        startMovement(
          createMovement({
            from: posRef.current,
            to: clampToBounds(
              { x: Math.round(vp.x + move.to * vp.width), y: posRef.current.y },
              boundsOf(vp, sizeRef.current),
            ),
            startAt: now,
            duration: Math.max(0, next.until - now),
          }),
          // 一段走完立刻决策下一段（此前由 rAF 循环内部直接调 tickRef）
          () => tickRef.current(),
        )
      }
      // 记一次"本会话加载过的 idle 素材"（上限判定只看这个集合）。
      // 判定用 `idleEraNames`：语义状态与点击应答**不计入** ——
      // 它们是必备表现，不该被闲暇额度挤掉（sleep 里的"小憩"同理，它属 state 池）。
      if (idleEraNames(cfgRef.current!).has(next.anim)) {
        markIdleLoaded(loadedIdleRef.current, next.anim, IDLE_SESSION_LIMIT)
      }
      // 落成视图帧：同名重播规则收在 `usePetView`（唯一一处）
      show(next, host.resolveAsset(next.anim))
    },
    [host, startMovement, posRef, cfgRef, show],
  )

  /** 排下一拍 */
  const step = useCallback((delayMs: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => tickRef.current(), Math.max(0, delayMs))
  }, [])

  /** 停掉定时链**与运动循环**（拖拽期间两者都要给手指让位） */
  const pause = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    stopMovement()
  }, [stopMovement])

  // 帧级那一路（拖拽）：位置的所有权在它手上，这里只提供必要的读写口
  const petDrag = usePetDrag({
    host,
    cfgRef,
    sizeRef,
    posRef,
    spriteRef,
    pause,
    resume: step,
    setAnim: setDrag,
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
      // 拖拽期间状态机**让位**：位置的主人是手指，不是定时链
      if (busyRef.current) return
      // 决策前先收口：万一还有残留运动，把它结算成真实位置再用
      const cur = settle()
      const t = Date.now()
      const vp = host.getViewport()
      const s = sizeRef.current
      // 真实应用状态 → 语义状态（确定性；见 services/pet/state.ts）
      const context = readWorld(t, visibleRef.current)
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
        wander: wanderRef.current,
        context,
        idleLoaded: loadedIdleRef.current,
        idleLimit: IDLE_SESSION_LIMIT,
      }
      const next = decide(cfgNow, prev, ctx)
      runtimeRef.current = next
      if (next === prev) return // 段还没走完且状态未变：不打断（订阅驱动的即时 tick 常走这条）
      apply(next, t)
      // move 段由 rAF 循环收尾（走完会回调 tickRef），其余段用定时器排下一拍
      if (!next.move) step(next.until - t)
    }
  }, [host, apply, step, busyRef, settle, readWorld, cfgRef])

  /**
   * **真实应用状态变了 → 立刻重算一次**（不等下一拍）。
   *
   * 这是"桌宠看到真实世界"的关键：天机开始推演 / 转成等待确认 / 收工成功，
   * 番茄钟开始或结束 —— 都在下一次 DOM 更新后马上反映到动画上。
   * `step(0)` 只是把定时链提前叫醒；`decide` 自己会判断"状态是否真的变了"，
   * 没变就原样返回（不打断正在播的闲暇动作）。
   */
  useEffect(() => {
    if (!cfg) return
    if (runtimeRef.current) step(0)
    // agent.phase 是派生值：阶段名相同时不必重算
  }, [cfg, agentPhase, focusing, wander, step, cfgRef])

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
      init(first.anim, host.resolveAsset(first.anim), first.facing)
      // 先落位（本机存档 → 旧字段 → 角落），再起链 —— 两者都在启动瞬间完成，无观感差异。
      // 读旧位置失败不该让桌宠彻底不出现（曾表现为"已开启但什么都没有"，静默无痕）：
      // 留一次痕，并按配置角落落位（与 placeInitial 自己的"没有存档"分支同一语义）。
      const onReady = () => {
        if (!alive) return
        setReady(true)
        step(cfg.tickMs.min)
      }
      void placeInitial(cfg, sizeRef.current).then(onReady).catch((err: unknown) => {
        recordError({ kind: 'rejection', where: 'usePetLoop.placeInitial',
          message: `桌宠落位失败：${describeThrown(err)}` })
        resetPositionOf(cfg, sizeRef.current)
        onReady()
      })
    }

    const off = host.onVisibilityChanged((visible) => {
      visibleRef.current = visible
      // 回前台补一次：后台期间可能已跨过好几个节拍，不补就会"愣住"
      if (visible && runtimeRef.current) step(0)
    })
    return () => {
      alive = false
      off()
      pause()
      cancelDrag() // 拖拽的计时器也要清：不清就是"卸载后还在跑"的孤儿
    }
  }, [cfg, host, placeInitial, step, pause, cancelDrag, resetPositionOf, cfgRef, init])

  /**
   * `ready` 之后立刻画一次真实位置：首次落位发生在组件挂载**之前**（那时 `spriteRef`
   * 还是 null，paint 是空写），少了这一步宠物会停在左上角。
   */
  useEffect(() => {
    if (ready) paint(posRef.current.x, posRef.current.y)
  }, [ready, paint, posRef])

  /** 宿主矩形变化（缩放 / 旋屏）→ 夹回屏内；不夹的话 `planMove` 两向都越界，宠物永久卡屏外 */
  useEffect(() => {
    /** ⚠️ **落位完成（`ready`）之前一次都不校正**（B7 实测缺陷）：首次落位要异步读旧位置，
     *  期间 `posRef` 还是 (0,0)，挂载即校正会把它夹成左上角并写进本机存档。 */
    if (!cfg || !ready) return
    const onResize = () => {
      // 拖拽期间不抢位置：位置的主人是手指
      if (busyRef.current) return
      clampInto(sizeRef.current)
    }
    window.addEventListener('resize', onResize)
    onResize() // 落位完成后校正一次：本机存档可能来自更大的屏幕
    return () => window.removeEventListener('resize', onResize)
    // `size` 也在依赖里：用户调大尺寸后要立刻按新尺寸夹回（否则会越界）
  }, [cfg, ready, busyRef, clampInto, size, cfgRef])

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
  }, [apply, consumeClickSuppression, step, settle, cfgRef])

  /** **立刻播一个指定动作**（Step 5-3E）：抢断当前段插播 `action` 相位、播完回状态机；
   *  不改 `state`（"等确认"期间点动作不会演丢）。名字走 `findPlayable` 白名单；拖拽期间让位。 */
  const playOnce = useCallback(
    (name: string) => {
      const cfgNow = cfgRef.current
      const prev = runtimeRef.current
      if (!cfgNow || !prev || busyRef.current) return
      const anim = findPlayable(cfgNow, name)
      if (!anim) return
      settle()
      const t = Date.now()
      const next: PetRuntime = { ...prev, phase: 'action', anim, until: t + PLAY_ONCE_MS, move: undefined }
      runtimeRef.current = next
      apply(next, t)
      step(next.until - t)
    },
    [apply, busyRef, step, settle, cfgRef],
  )

  /**
   * 读一次当前位置 —— 给气泡 / 菜单这类**低频**消费者（返回副本，防被就地改写）
   */
  const getPosition = useCallback(() => ({ ...posRef.current }), [posRef])

  /** 读一次宿主可活动边界（组件夹回用，替代直接读 `window`） */
  const getBounds = useCallback(() => boundsOf(host.getViewport(), sizeRef.current), [host])

  return {
    view,
    ready,
    size,
    onClick,
    getPosition,
    getBounds,
    spriteRef,
    drag: petDrag.drag,
    warmup,
    resetPosition,
    playOnce,
  }
}
