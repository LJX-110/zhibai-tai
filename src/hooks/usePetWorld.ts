/**
 * 桌宠 · **世界视图**（真实应用状态 → 一处收口）
 *
 * ## 为什么单独成 hook
 * 桌宠要"看到真实世界"就必须订阅好几样东西（天机 Agent 阶段 / 番茄钟 / 漫游开关 /
 * 页面可见性 / 用户多久没互动）。这些订阅原先散在 `usePetLoop` 里 ——
 * 那个文件已经顶到 400 行上限（`check:rules` 规则 1），而"世界是什么样"
 * 与"该播哪一段、下一拍排到何时"本来就是两件事。
 *
 * ## 两条容易踩的线
 *  · **订阅式值给 React**（用于"状态一变立刻重算"的 effect 依赖）；
 *  · **读一次的值给定时链**（`read()` 走 ref，不进 React 依赖 ——
 *    否则每次订阅变化都会把定时链的 callback 重建，正是"宠物完全不动"的老坑）。
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { getAgentStatus, subscribeAgentStatus, type AgentPhase } from '../services/agent/status'
import type { PetContext } from '../services/pet/state'
import { useSettingsStore } from '../stores/useSettingsStore'
import { usePomodoroTimerStore } from '../stores/usePomodoroTimerStore'

/**
 * 最近一次用户互动的时刻（**页面级**：指针与键盘都算）。
 * 模块级而不是 ref：`read()` 要在不触发重渲染的前提下读到它，
 * 且同一页面里所有桌宠实例共用一个基准（只有一个实例，但语义上更对）。
 */
let lastInteractAt = Date.now()

export interface PetWorld {
  /** 天机 Agent 阶段（订阅式；变化 → 立刻重算一次） */
  agent: AgentPhase
  /** 番茄钟是否在专注（订阅式） */
  focusing: boolean
  /** 用户是否允许漫游（订阅式；默认关） */
  wander: boolean
  /** 读一次完整上下文（给定时链用；**不进 React 依赖**） */
  read: (now: number, visible: boolean) => PetContext
}

export function usePetWorld(celebrateUntil = 0): PetWorld {
  const agent = useSyncExternalStore(subscribeAgentStatus, getAgentStatus)
  const focusing = usePomodoroTimerStore((s) => s.running)
  const wander = useSettingsStore((s) => s.petWander)

  /** 给定时链读的值放 ref：避免把 tickRef 的赋值 effect 打散 */
  const ref = useRef({ agent: agent.phase, focusing, wander })
  useEffect(() => {
    ref.current = { agent: agent.phase, focusing, wander }
  }, [agent, focusing, wander])

  /**
   * 「长时间无互动 → 睡着」的判据：**页面级**的指针与键盘活动都算互动
   * （不只是摸宠物本身）。捕获阶段的被动监听，不干扰任何业务逻辑。
   */
  useEffect(() => {
    const touch = () => {
      lastInteractAt = Date.now()
    }
    window.addEventListener('pointerdown', touch, { passive: true, capture: true })
    window.addEventListener('keydown', touch, { passive: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', touch, { capture: true })
      window.removeEventListener('keydown', touch, { capture: true })
    }
  }, [])

  /**
   * 庆祝窗口走 **ref** 读，不进 `read` 的依赖数组。
   *
   * 这一点必须守住：`read` 的引用一变，`usePetLoop` 里那条起链的 effect 会重建，
   * 定时链被打散 —— 就是历史上"宠物完全不动"那个坑（文件头有记录）。
   * 所以这里只把最新值放进 ref，`read` 的 identity 永远稳定。
   */
  const celebrateRef = useRef(0)
  useEffect(() => {
    celebrateRef.current = celebrateUntil
  }, [celebrateUntil])

  const read = useCallback(
    (now: number, visible: boolean): PetContext => ({
      agent: ref.current.agent,
      focusing: ref.current.focusing,
      idleMs: now - lastInteractAt,
      visible,
      now,
      celebrateUntil: celebrateRef.current || undefined,
    }),
    [],
  )

  return { agent: agent.phase, focusing, wander, read }
}