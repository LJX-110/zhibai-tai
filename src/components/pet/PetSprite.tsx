/**
 * 桌宠 · 渲染层
 *
 * 只做四件事：**定位（transform）、朝向（scaleX 镜像）、预载后换帧、换动画（key 重挂载）**。
 *
 * ⚠️ **位置不由 React 管**（2026-09-27 改）：`transform` 从 style 里彻底移出，
 * 完全交给 hook 直接写 DOM —— 若走 React，任何一次无关渲染（换动画、气泡出现）
 * 都会用"上一次渲染时的旧位置"把 DOM 覆盖回去。
 * 本组件挂载后 hook 会立刻 paint 一次真实位置（`ready` 的 effect）。
 *
 * ## ⚠️ 换帧必须「预载完成才上屏」（2026-10-07 修用户上报的"消失一下"）
 * 旧写法直接把上屏 `<img>` 换成新素材：单张 animated WebP 约 521KB，
 * 没进缓存时浏览器在加载期间**什么都画不出来** —— 换动作 / 拖动时宠物先空白一下再出现
 * （手机网络下最明显）；加载失败时更是"整只不见了，过一会儿又自己回来"。
 *
 * 现在目标帧先在**隐藏的预载层**里加载：
 *  · 成功 → 才替换上屏帧（此时资源已在缓存，重挂载即刻成像）；
 *  · 失败 → **保留旧帧**（绝不留下空白）+ 限次重试 + 记一次故障流水（兜底必须留痕）。
 * 预载层刻意**不走命令式预载**（`new Image` 那一套）：`pet-assets.test.ts` 有结构性护栏 ——
 * 批量加载只允许出现在 PetStage 的首屏预热里；一个隐藏的 `<img>` 是同一件事，且走同一条 SW 缓存。
 *
 * ## key 里为什么带 `seq`
 * `key` 变 = 从第一帧重播。只按素材名做 key 时，"点它一下"这类**同名重播**
 * （上次抽到的就是同一张点击回应）不会重挂载 → 看起来像"点了没反应"。
 * `seq` 由 `usePetLoop` 在每次"插播"（点击回应 / 动作 / 拖动姿态）时递增。
 *
 * 交互：只有宠物自身的矩形可点（`pointer-events` 只在该矩形上开），
 * 否则一个 fixed 全屏层会挡住整个应用的点击。
 *
 * 指针事件**原样转发**给 hook，这里不做任何判断 —— 点击 / 长按 / 拖拽三者的互斥、
 * 阈值、跟手、夹回全在 `usePetDrag` + `services/pet/interaction`（可测）。
 * 渲染层越薄越好：长按判定曾因为在这里与拖拽层**各持一份 ref 且互相清空**而失效，
 * 表现为"拖它也不取消长按，500ms 后照样弹菜单"。
 */
import { memo, useRef, useState } from 'react'
import { cn } from '../../utils/cn'
import { petHeight } from '../../services/pet/geometry'
import { recordError } from '../../services/error-log'
import type { PetView } from '../../hooks/usePetLoop'
import type { PetDragHandlers } from '../../hooks/usePetDrag'

/** 素材加载失败的重试：初次 + 2 次重试（网络抖动多半一次就自愈；仍失败保留旧帧并留痕） */
const LOAD_RETRY_MAX = 2
/** 重试间隔（ms）：给缓存 / SW 一点写入时间，也避免把失败刷成高频请求 */
const LOAD_RETRY_MS = 1200

/** 一帧 = 素材名 + 重播序号 + 已解析的 URL（seq 进 key，见文件头） */
interface PetFrame {
  anim: string
  seq: number
  src: string
}

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
  seq,
  size,
  name,
  reducedMotion,
  onClick,
  onMenu,
  nodeRef,
  drag,
}: PetSpriteProps) {
  const height = petHeight(size)
  /** 当前**已上屏**的帧（首帧直出；此后一律"预载成功才替换"） */
  const [frame, setFrame] = useState<PetFrame>(() => ({ anim, seq, src }))
  /** 预载重试计数（进预载 img 的 key：重挂载 = 重新发一次请求） */
  const [retry, setRetry] = useState<{ key: string; count: number }>({
    key: `${anim}:${seq}`,
    count: 0,
  })
  /** 已记过流水的素材（会话级，按素材名）：同一张坏图不该把故障流水刷满 */
  const loggedRef = useRef<Set<string>>(new Set())

  const wantKey = `${anim}:${seq}`
  const frameKey = `${frame.anim}:${frame.seq}`
  /** 目标帧还没上屏 → 需要预载（首帧例外：`frame` 初值就是它） */
  const needPreload = wantKey !== frameKey

  // 换目标帧 → 重试次数清零。**渲染期派生**（它本来就是"由 prop 派生"的取值）：
  // 写进 effect 会被 oxlint 的 `set-state-in-effect` 拦下，也多一轮渲染。
  if (retry.key !== wantKey) setRetry({ key: wantKey, count: 0 })

  const onPreloadError = () => {
    if (!loggedRef.current.has(anim)) {
      loggedRef.current.add(anim)
      recordError({ kind: 'error', where: 'pet/PetSprite', message: `桌宠素材加载失败：${anim}` })
    }
    // 限次重试：换 key 重挂预载 img（同 URL 再给一次机会；SW / HTTP 缓存可能刚写完）
    if (retry.count < LOAD_RETRY_MAX) {
      window.setTimeout(() => setRetry((r) => ({ key: r.key, count: r.count + 1 })), LOAD_RETRY_MS)
    }
    // 超过上限：保留旧帧不再重试 —— 下一次决策换动画会自然重走这条链路
  }

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
          // key 带 seq：插播（点击 / 动作）即使素材同名也要从第一帧重播（见文件头）
          key={frameKey}
          src={frame.src}
          alt={name}
          draggable={false}
          decoding="async"
          className={cn('h-full w-full object-contain', reducedMotion && 'transition-none')}
          style={{
            // 镜像用 scaleX，与位移同属 transform，不触发重排
            transform: facing === 'right' ? 'scaleX(-1)' : undefined,
          }}
        />
        {/* 预载层（隐藏）：目标帧在这里加载，成功后才替换上屏 —— 加载期间旧帧继续显示，
            不再出现空白。用隐藏 <img> 而不走命令式预载的理由见文件头。 */}
        {needPreload && (
          <img
            key={`pre:${wantKey}:${retry.count}`}
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="hidden"
            onLoad={() => setFrame({ anim, seq, src })}
            onError={onPreloadError}
          />
        )}
      </button>
    </div>
  )
})