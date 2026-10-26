/**
 * 天机 · 动作提议的裁决（确认 / 忽略）
 *
 * 从 `use-tianji-chat` 拆出：它只负责"一条提议执行了没有、界面记成什么状态"，
 * 与会话流式编排不是同一件事。
 *
 * 三条纪律：
 *  · 只有用户点「确认」才落库；失败不伪装成功；
 *  · **执行中禁止再点**（双击会写两条：守卫必须是同步 ref，不能只靠 state）；
 *  · 裁决结果写回该条消息的轨迹，否则下一轮模型以为事情还悬着。
 */
import { useRef, useState } from 'react'
import { endAgentRun, finishAgentRun } from '../../services/agent/status'
import { useToastStore } from '../ui/toast-store'
import { applyTianjiAction } from './action-runner'
import { actionTitle } from './action-text'
import { actionDefFor } from './plugins'
import type { TianjiActionPayload } from './action-protocol'
import type { ChatTrace } from './chat-history'

type Resolution = 'done' | 'skip'

export function useTianjiActions(options: {
  /** 裁决后把结果写回会话轨迹（会话侧提供；不传则只改本地状态） */
  onTrace?: (messageId: string, step: ChatTrace) => void
} = {}) {
  const [resolved, setResolved] = useState<Record<string, Resolution>>({})
  /** 执行中的卡片（用于禁用按钮，避免用户以为没点上 */
  const [running, setRunning] = useState<Record<string, true>>({})
  const runningRef = useRef<Set<string>>(new Set())

  const settle = (messageId: string, j: number, state: Resolution) =>
    setResolved((r) => ({ ...r, [`${messageId}-${j}`]: state }))

  const confirmAction = async (messageId: string, j: number, a: TianjiActionPayload) => {
    const key = `${messageId}-${j}`
    if (runningRef.current.has(key)) return
    runningRef.current.add(key)
    setRunning((r) => ({ ...r, [key]: true }))

    let ok = false
    let detail = ''
    try {
      ok = await applyTianjiAction(a)
      detail = ok ? actionTitle(a) : '未写入：这条提议已失效'
      if (!ok) useToastStore.getState().push(detail, 'danger')
    } catch (e) {
      detail = `执行失败：${e instanceof Error ? e.message : String(e)}`
      useToastStore.getState().push(detail, 'danger')
    }

    settle(messageId, j, ok ? 'done' : 'skip')
    options.onTrace?.(messageId, {
      toolId: a.action,
      toolName: actionDefFor(a.action)?.label ?? a.action,
      ok,
      summary: detail,
    })

    // 确认这一下就是 Agent 的"等待"结束：落库成功 → 收工；失败 → 进 error（桌宠黑脸）
    if (ok) finishAgentRun('success', { currentTask: '已落库' })
    else finishAgentRun('error', { errorMessage: detail })

    if (ok) {
      // 中文名取自归属插件，不在这里硬编码具体动作名
      const label = actionDefFor(a.action)?.label ?? a.action
      useToastStore.getState().push(`已加入${label}：${actionTitle(a)}`, 'success')
    }

    runningRef.current.delete(key)
    setRunning((r) => {
      const next = { ...r }
      delete next[key]
      return next
    })
  }

  const skipAction = (messageId: string, j: number, a: TianjiActionPayload) => {
    settle(messageId, j, 'skip')
    options.onTrace?.(messageId, {
      toolId: a.action,
      toolName: actionDefFor(a.action)?.label ?? a.action,
      ok: false,
      summary: '已忽略，未写入',
    })
    // 忽略 ≠ 出错，也不是成功：直接回到待命（桌宠不再等）
    endAgentRun()
  }

  return {
    resolved,
    running,
    resetResolved: () => setResolved({}),
    confirmAction,
    skipAction,
  }
}
