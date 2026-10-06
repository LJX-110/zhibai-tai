/**
 * 桌宠 · 入口（挂载 / 卸载的唯一开关）
 *
 * `petEnabled === false` 时**返回 `null`** —— 零 DOM、零定时器、零素材请求。
 * 这是"桌宠不拖累首屏"的关键：`usePetLoop` 只在真正渲染时才被调用，
 * 所以关掉桌宠的用户不会为它付任何代价（含那 55MB 素材）。
 *
 * 素材按需加载：只请求当前要播的那一张；另外在**空闲时预热**待机池与点击池
 * （最常用的几张），这样首次点击不会看到空白 —— 单个素材约 521KB，
 * 不预热的话第一次切换会有明显空窗。
 *
 * 这里也是**交互的总装**：动画（usePetLoop）+ 拖拽（usePetDrag，挂在 Sprite 里）
 * + 搭话（usePetSaying）+ 菜单（P5）。各自独立，本文件只负责把事件接到一起去。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useAppStore } from '../../stores/useAppStore'
import { parseSection } from '../../app/navigation'
import { useTaskStore } from '../../stores/useTaskStore'
import { usePomodoroTimerStore } from '../../stores/usePomodoroTimerStore'
import { usePetStore } from '../../stores/usePetStore'
import { usePetLoop } from '../../hooks/usePetLoop'
import { usePetSaying } from '../../hooks/usePetSaying'
import { usePetStateSpeech } from '../../hooks/usePetStateSpeech'
import { petAssetUrl } from '../../services/pet/config'
import { hushFor } from '../../services/pet/saying-throttle'
import { daysTogether } from '../../services/pet/affinity'
import { refuseFatTalk } from '../../services/pet/persona'
import { effectiveDone } from '../../utils/id'
import { prefersReducedMotion } from '../../utils/motion'
import { useToast } from '../ui/toast-store'
import type { Saying } from '../../services/pet/sayings'
import { PetSprite } from './PetSprite'
import { PetBubble } from './PetBubble'
import { PetMenu } from './PetMenu'
import type { PetMenuAction } from './menu-items'
import { onCompletion } from '../../services/completion'
import { onPlayAnim, onResetPosition } from '../../services/pet/commands'
import { usePetVoice } from '../../hooks/usePetVoice'
import { requestPetLine } from '../../services/pet/ai-speech'
import { getAiRemoteHealth } from '../../services/ai/health'
import { requestSettingsGroup } from '../../services/settings-intent'

/** 预热上限：别一次把 107 张（约 63MB）都拉下来。当前配置下待机 1 张 + 点击 5 张 + 拖动 1 张 = 7 张 */
const WARMUP_LIMIT = 8
/** 菜单里「安静一小时」的时长 */
const HUSH_MS = 60 * 60 * 1000
/**
 * 「重要完成」的庆祝时长（ms）—— 完成待办/交作业/收工之后，桌宠高兴 4 秒。
 * 时长取自 `success` 的既有停留观感（`STATE_DWELL_MS.success` 量级），
 * 不另立一套节奏。
 */
const CELEBRATE_MS = 4000

export function PetStage() {
  const enabled = useSettingsStore((s) => s.petEnabled)
  if (!enabled) return null
  return <PetStageInner />
}

/**
 * 拆出内层组件的原因：`enabled` 为 false 时**连 hook 都不调用**。
 * 若把 `usePetLoop()` 写在外层再靠 return null 提前退出，
 * 配置拉取仍会照跑（hook 已执行）—— 那就等于"关着也在请求"。
 */
function PetStageInner() {
  const longPressedRef = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  /**
   * 庆祝窗口（截止时刻，ms）。**D-4 拍板方案 B**：给状态机的输入加一个有时限的标记，
   * 对外仍只返回已有的 `success` —— 不新增 `PetState` 枚举值、不新增宠物状态。
   *
   * 用**订阅**而不是让完成服务去写宠物 store：服务层不该反向驱动业务状态；
   * 谁来表现（桌宠、Toast、动画）由视图自己订阅决定。
   */
  const [celebrateUntil, setCelebrateUntil] = useState(0)
  useEffect(
    () =>
      onCompletion((plan, event) => {
        if (plan.level !== 'important') return
        // 好感 +1（用户 2026-09-30 拍板：完成也加好感）。
        // **数值与每日上限不在这里** —— 全部留在 `services/pet/affinity.ts` 的规则表里，
        // 这里只报"发生了一件重要完成"这个事件。
        void usePetStore.getState().grantAffinity('task-done')
        // 截止时刻由**事件时间**推算（不在组件体里取当前时间，与项目"时间走工具"一致）；
        // 事件时间不合法时得到过去时刻 → 不庆祝（失败安全）
        setCelebrateUntil(new Date(event.completedAt).getTime() + CELEBRATE_MS)
      }),
    [],
  )
  /** 长按唤起菜单（移动端没有右键，这是等价操作）。存进 ref 传给 hook，避免依赖抖动 */
  const onLongPress = useCallback(() => {
    longPressedRef.current = true
    setMenuOpen(true)
  }, [])
  /** 桌面右键：与长按同一出口（`PetSprite` 转发 contextmenu） */
  const onMenuRequest = useCallback(() => {
    longPressedRef.current = true
    setMenuOpen(true)
  }, [])
  const { view, ready, size, onClick, getPosition, getBounds, spriteRef, drag, warmup, resetPosition, playOnce } =
    usePetLoop(undefined, onLongPress, celebrateUntil)

  // 「恢复默认位置」命令：设置页发出 → 这里执行（宠物侧才知道怎么落位）
  useEffect(() => onResetPosition(resetPosition), [resetPosition])
  // 「动作」列表 / 菜单发来的播放命令：立刻播那个动作（Step 5-3E）
  useEffect(() => onPlayAnim(playOnce), [playOnce])
  const { bubble, refresh, dismiss } = usePetSaying()
  const toast = useToast().toast
  const setSection = useAppStore((s) => s.setSection)
  const setSettings = useSettingsStore((s) => s.set)
  const affinity = usePetStore((s) => s.affinity)
  const petCreatedAt = usePetStore((s) => s.createdAt)
  const reducedMotion = prefersReducedMotion()
  /** 戳它之后的顶嘴（独立于搭话，不走节流 —— 是**你主动**问的，不该被挡） */
  const [poke, setPoke] = useState<Saying | null>(null)
  const pokeTimerRef = useRef<number | null>(null)
  /**
   * Agent 状态台词（天机在做什么 → 它说一句）。
   * 优先级：戳它（poke）> **状态台词** > 日常搭话 —— 正在发生的事比"碎碎念"更值得占气泡。
   */
  const stateSpeech = usePetStateSpeech()
  /**
   * 台词开关（Step 5-2C F 批 · 用户拍板）：关掉后**不显示常驻台词**
   * （状态台词 + 自主搭话），但**动画 / 状态 / 点击 / 拖动 / Agent / 好感全部照常**。
   *
   * 为什么 `poke` 不受它管：那是"**你主动戳它**"的回应，属于**互动**而不是常驻表现 ——
   * 把它也关掉会变成"点了没反应"。菜单里的「安静一小时」仍是临时手段，两者不冲突。
   */
  const speechEnabled = useSettingsStore((s) => s.petSpeechEnabled)
  /** 「AI 台词」：气泡里的话优先由人设生成（未配 / 失败自动回退本地） */
  const aiSpeechEnabled = useSettingsStore((s) => s.petAiSpeech)
  /** 语气三要素（自称 / 称呼 / 主食）—— AI 台词与本地台词共用同一份人设 */
  const voice = usePetVoice()
  const ambientSpeech = speechEnabled ? (stateSpeech ?? bubble) : null
  const shown = poke ?? ambientSpeech
  /**
   * 气泡 / 菜单的锚点：它们要出现的那一刻**读一次**当前位置即可。
   * 让它们每帧跟着宠物走反而会在移动中"甩"出去 —— 而它们本来就是
   * "站在那儿说的一句话"，留在原地更自然，也省掉每帧重渲染。
   * （刻意不用 state + effect：那样会多一轮渲染，而这里每次渲染直接读就够了。）
   */
  const anchor = poke || stateSpeech || bubble || menuOpen ? getPosition() : ORIGIN

  // 空闲时预热待机 / 点击应答素材（首次切换不空窗）；失败静默 —— 预热失败只影响观感。
  // 名单由 hook 从 `config.json` 派生（`animation-policy.warmupAnims`），渲染层不写死素材名。
  useEffect(() => {
    if (!ready) return
    const idle = () => {
      for (const n of warmup.slice(0, WARMUP_LIMIT)) {
        const img = new Image()
        img.src = petAssetUrl(n)
      }
    }
    const t = window.setTimeout(idle, 2000)
    return () => window.clearTimeout(t)
  }, [ready, warmup])

  /** 点它：先记互动，再让动画与搭话各自响应 */
  const onPetClick = useCallback(() => {
    const pet = usePetStore.getState()
    void pet.grantAffinity('first-interact')
    void pet.grantAffinity('click')
    onClick()
    refresh()
  }, [onClick, refresh])

  /** 拖完 / 长按后：记一次互动，但不占"点击"额度 */
  const onInteracted = useCallback(() => {
    void usePetStore.getState().grantAffinity('first-interact')
    refresh()
  }, [refresh])

  /** 「让它说句话」的实现放 ref：onMenuAction 定义在它之前，用 ref 打破循环依赖
      （回调只在用户点选时执行，读到的必然是最新实现） */
  const pokeBackRef = useRef<() => void>(() => {})

  const onMenuAction = useCallback(
    (a: PetMenuAction) => {
      setMenuOpen(false)
      switch (a) {
        case 'say':
          // 显式的「让它说句话」（Step 5-3E 菜单重设计）：与点它一下同一条路
          longPressedRef.current = false
          onInteracted()
          pokeBackRef.current()
          break
        case 'settings':
          // 跳到「系统 · 桌宠」：先切分组意图，再把页面带过去
          requestSettingsGroup('pet')
          setSection('system')
          break
        case 'seclusion': {
          // 取一件还没做的（与闭关页同一口径，不另造规则）
          const next = useTaskStore.getState().items.filter((t) => !effectiveDone(t))[0]
          const timer = usePomodoroTimerStore.getState()
          timer.setMode('focus')
          if (next) timer.setAssoc('task', next.id)
          timer.start()
          setSection('study')
          toast(next ? `已入关 · ${next.title}` : '已入关（暂无可认领的实事）', 'success')
          break
        }
        case 'quick':
          // 复用既有的 '/' 热键：命令面板会自己开（与顶栏搜索按钮同一条通路）
          window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))
          break
        case 'today':
          setSection('overview')
          break
        case 'hush':
          hushFor(HUSH_MS)
          toast('安静一小时 —— 只压它的搭话，不动通知设置', 'info')
          break
        case 'off':
          setSettings({ petEnabled: false })
          toast('桌宠已收起（可在设置里再开）', 'info')
          break
      }
    },
    [onInteracted, setSection, setSettings, toast],
  )

  /**
   * 让它说一句（点它 / 菜单「让它说句话」共用）。
   * 先**立刻**显示本地台词（回应感不能等），若开了 AI 台词再让生成的那句替换上来 ——
   * 8 秒超时 + 失败静默回退（见 `ai-speech`），所以最坏情形就是本地那句。
   */
  const pokeBack = useCallback(() => {
    setPoke({ key: 'poke', text: refuseFatTalk(), hash: '' })
    if (pokeTimerRef.current !== null) window.clearTimeout(pokeTimerRef.current)
    pokeTimerRef.current = window.setTimeout(() => setPoke(null), 2400)
    if (aiSpeechEnabled && getAiRemoteHealth().state !== 'unconfigured') {
      void requestPetLine({
        voice: { self: voice.self, master: voice.master, food: voice.food },
        scene: '刚被主人戳了一下，回应一句',
      }).then((line) => {
        if (line) setPoke((cur) => (cur && cur.key === 'poke' ? { ...cur, text: line } : cur))
      })
    }
  }, [aiSpeechEnabled, voice])
  useEffect(() => {
    pokeBackRef.current = pokeBack
  }, [pokeBack])

  /** 菜单关闭：长按 / 右键唤起的菜单关掉后补一次互动（像"刚被摸过"） */
  const onMenuClose = useCallback(() => {
    setMenuOpen(false)
    if (longPressedRef.current) {
      longPressedRef.current = false
      onInteracted()
    }
  }, [onInteracted])

  if (!ready || !view) return null

  const days = daysTogether(petCreatedAt, new Date())
  const meta = `相识 ${days} 天 · 好感 ${affinity}`

  return (
    <>
      <PetSprite
        {...view}
        size={size}
        name="知白"
        reducedMotion={reducedMotion}
        onClick={onPetClick}
        onMenu={onMenuRequest}
        nodeRef={spriteRef}
        drag={drag}
      />
      {shown && (
        <PetBubble
          saying={shown}
          name="知白"
          x={anchor.x}
          y={anchor.y}
          size={size}
          reducedMotion={reducedMotion}
          onGo={() => {
            if (poke) {
              setPoke(null)
              return
            }
            // 气泡的 `›` 与通知深链同一套 hash；解析走唯一出口，非法就不跳
            const section = parseSection(shown.hash)
            if (section) setSection(section)
            dismiss()
          }}
        />
      )}
      {/* 菜单：**回到原先的紧凑浮层**（2026-10-01 用户拍板："弹层太大了，用原先那种"）——
          底部抽屉已删除；桌面与移动共用这一个贴宠物的小面板（长按 / 右键唤起，条目 7 条） */}
      <PetMenu
        open={menuOpen}
        x={anchor.x}
        y={anchor.y}
        size={size}
        bounds={getBounds()}
        meta={meta}
        onAction={onMenuAction}
        onClose={onMenuClose}
      />
    </>
  )
}

/** 气泡 / 菜单不显示时的默认锚点（模块级常量，避免每次渲染新建对象） */
const ORIGIN = { x: 0, y: 0 }
