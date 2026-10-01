/**
 * 桌宠 · Agent 状态台词（Step 4-2 · B6/D3）
 *
 * ## 这里解决什么
 * 桌宠除了"看见你的数据"（`usePetSaying` 的周期性搭话），还要"看见天机在做什么"：
 * 开始推演说一句、等主人确认说一句、完成邀功一句、出错黑脸一句。
 * 那些是**事件**（Agent 阶段跃迁），不是周期，所以单独一个 hook。
 *
 * ## 两条纪律（规格 §B6/D3）
 *  · **状态优先于表演**：说不说由真实阶段决定，人格只决定"怎么说"；
 *  · **不打扰**：只有阶段**跃迁**才开口（同一阶段持续再久也只说一次），
 *    台词气泡 4 秒后自己消失。
 *
 * ⚠️ 实现用**渲染期守卫**而不是 effect 里同步 setState ——
 * 后者会多一轮级联渲染，也是 oxlint `set-state-in-effect` 所指的问题
 * （项目既有同类写法：情报页的筛选守卫）。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAgentStatus, subscribeAgentStatus, type AgentPhase } from '../services/agent/status'
import { stateSaying, type Saying } from '../services/pet/sayings'
import { usePetVoice } from './usePetVoice'

/** 状态台词的气泡停留时长（比日常搭话略长：它说的是"正在发生的事"） */
const BUBBLE_MS = 4200

interface SpeechRecord {
  /** 触发这条台词的阶段（跃迁判据；**显示与否也记在这里**，便于一次 state 说完） */
  phase: AgentPhase
  saying: Saying
  /** 是否还在气泡展示期内（到点由 timeout 置 false，不参与渲染判时） */
  shown: boolean
}

export function usePetStateSpeech(): Saying | null {
  const agent = useSyncExternalStore(subscribeAgentStatus, getAgentStatus)
  const voice = usePetVoice()
  const [rec, setRec] = useState<SpeechRecord | null>(null)

  // 阶段跃迁 → 换台词（渲染期派生，不写 effect；见文件头说明）。
  // `phase` 只记阶段、不随气泡收起清空 —— 否则"阶段没变"会被误判成又一次跃迁。
  if (agent.phase !== (rec?.phase ?? 'idle')) {
    const line = agent.phase === 'idle' ? null : stateSaying(agent.phase, voice)
    setRec(line ? { phase: agent.phase, saying: line, shown: true } : null)
  }

  // 到点收起气泡（setState 在 timeout 回调里，不违反 set-state-in-effect）
  useEffect(() => {
    if (!rec?.shown) return
    const t = window.setTimeout(() => {
      setRec((r) => (r ? { ...r, shown: false } : r))
    }, BUBBLE_MS)
    return () => window.clearTimeout(t)
  }, [rec])

  return rec?.shown ? rec.saying : null
}