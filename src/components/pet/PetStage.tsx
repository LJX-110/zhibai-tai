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
import { PetMenu, type PetMenuAction } from './PetMenu'

/** 预热上限：别一次把 106 张（约 55MB）都拉下来，只热最常用的几张 */
const WARMUP_LIMIT = 6
/** 菜单里「安静一小时」的时长 */
const HUSH_MS = 60 * 60 * 1000

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
  const { view, ready, onClick, spriteRef, drag } = usePetLoop()
  const { bubble, refresh, dismiss } = usePetSaying()
  const toast = useToast().toast
  const setSection = useAppStore((s) => s.setSection)
  const setSettings = useSettingsStore((s) => s.set)
  const affinity = usePetStore((s) => s.affinity)
  const petCreatedAt = usePetStore((s) => s.createdAt)
  const reducedMotion = prefersReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  /** 戳它之后的顶嘴（独立于搭话，不走节流 —— 是**你主动**问的，不该被挡） */
  const [poke, setPoke] = useState<Saying | null>(null)
  const pokeTimerRef = useRef<number | null>(null)
  const longPressedRef = useRef(false)

  // 空闲时预热待机/点击素材（首次切换不空窗）；失败静默 —— 预热失败只影响观感
  useEffect(() => {
    if (!ready) return
    const idle = () => {
      for (const n of warmupNames.slice(0, WARMUP_LIMIT)) {
        const img = new Image()
        img.src = petAssetUrl(n)
      }
    }
    const t = window.setTimeout(idle, 2000)
    return () => window.clearTimeout(t)
  }, [ready])

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

  const onMenuAction = useCallback(
    (a: PetMenuAction) => {
      setMenuOpen(false)
      switch (a) {
        case 'seclusion': {
          // 认领一件实事：取一件还没做的（与闭关页同一口径，不另造规则）
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
    [setSection, setSettings, toast],
  )

  const pokeBack = useCallback(() => {
    setPoke({ key: 'poke', text: refuseFatTalk(), hash: '' })
    if (pokeTimerRef.current !== null) window.clearTimeout(pokeTimerRef.current)
    pokeTimerRef.current = window.setTimeout(() => setPoke(null), 2400)
  }, [])

  if (!ready || !view) return null

  const days = daysTogether(petCreatedAt, new Date())
  const meta = `相识 ${days} 天 · 好感 ${affinity}`

  return (
    <>
      <PetSprite
        {...view}
        size={VIEW_SIZE}
        name="知白"
        reducedMotion={reducedMotion}
        onClick={onPetClick}
        nodeRef={spriteRef}
        drag={drag}
        onLongPress={() => {
          longPressedRef.current = true
          setMenuOpen(true)
        }}
      />
      {(poke ?? bubble) && (
        <PetBubble
          saying={(poke ?? bubble)!}
          x={view.x}
          y={view.y}
          size={VIEW_SIZE}
          reducedMotion={reducedMotion}
          onGo={() => {
            const cur = poke ?? bubble
            if (poke) {
              setPoke(null)
              return
            }
            // 气泡的 `›` 与通知深链同一套 hash；解析走唯一出口，非法就不跳
            const section = parseSection(cur?.hash)
            if (section) setSection(section)
            dismiss()
          }}
        />
      )}
      <PetMenu
        open={menuOpen}
        x={view.x}
        y={view.y}
        size={VIEW_SIZE}
        meta={meta}
        onPoke={pokeBack}
        onAction={onMenuAction}
        onClose={() => {
          setMenuOpen(false)
          // 长按唤起的菜单关闭后补一次互动（像"刚被摸过"）
          if (longPressedRef.current) {
            longPressedRef.current = false
            onInteracted()
          }
        }}
      />
    </>
  )
}

/** 与 config.json 的 size 保持一致（渲染尺寸；配置仅用于几何与素材解析） */
const VIEW_SIZE = 160

/** 预热名单：待机与点击回应（最高频），其余等真正播到时再拉 */
const warmupNames = ['待机呼吸休闲', '东张西望', '点击回应-开心跃动', '点击回应-元气挥手', '点击回应-害羞惊讶', '点击回应-傲娇生气']
