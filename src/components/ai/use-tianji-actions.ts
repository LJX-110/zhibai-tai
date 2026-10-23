/**
 * 天机 · 动作提议的裁决（确认 / 忽略）
 *
 * 从 `use-tianji-chat` 拆出：它只负责"一条提议执行了没有、界面记成什么状态"，
 * 与会话流式编排不是同一件事。拆开后会话侧只剩 `resolved` 的读取与重置。
 *
 * 纪律：只有用户点「确认」才落库；失败不伪装成功（store 内部已提示原因），
 * 「忽略」既不写数据也不算错误 —— 桌宠只回到待命，不黑脸。
 */
import { useState } from 'react'
import { endAgentRun, finishAgentRun } from '../../services/agent/status'
import { useToastStore } from '../ui/toast-store'
import { applyTianjiAction } from './action-runner'
import { actionTitle } from './action-text'
import { actionDefFor } from './plugins'
import type { TianjiActionPayload } from './action-protocol'

type Resolution = 'done' | 'skip'

export function useTianjiActions() {
  const [resolved, setResolved] = useState<Record<string, Resolution>>({})

  const settle = (i: number, j: number, state: Resolution) => {
    setResolved((r) => ({ ...r, [`${i}-${j}`]: state }))
  }

  const confirmAction = async (i: number, j: number, a: TianjiActionPayload) => {
    let ok = false
    try {
      ok = await applyTianjiAction(a)
    } catch (e) {
      // 插件 run 极少直接抛（写入失败由 store 工厂提示），但异常不能让界面停在"待裁决"
      useToastStore.getState().push(`落库失败：${e instanceof Error ? e.message : String(e)}`, 'danger')
    }
    settle(i, j, ok ? 'done' : 'skip')
    // 确认这一下就是 Agent 的"等待"结束：落库成功 → 收工；失败 → 进 error（桌宠黑脸）
    if (ok) finishAgentRun('success', { currentTask: '已落库' })
    else finishAgentRun('error', { errorMessage: '落库失败' })
    if (ok) {
      // 中文名取自归属插件，不在这里硬编码具体动作名
      const label = actionDefFor(a.action)?.label ?? a.action
      useToastStore.getState().push(`已加入${label}：${actionTitle(a)}`, 'success')
    }
  }

  const skipAction = (i: number, j: number) => {
    settle(i, j, 'skip')
    // 忽略 ≠ 出错，也不是成功：直接回到待命（桌宠不再等）
    endAgentRun()
  }

  return {
    resolved,
    resetResolved: () => setResolved({}),
    confirmAction,
    skipAction,
  }
}
