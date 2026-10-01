/**
 * 天机 · Agent 运行装配（**把纯逻辑的循环接上真实世界**；Step 4-2 · C3/C5/D1 / Step 4-3 · 二）
 *
 * ## 这一层负责什么（也是它必须存在的理由）
 * `services/agent/loop.ts` 是纯逻辑（依赖注入），这里做五件它不该知道的事：
 *  ① **取真实依赖**：Provider、插件工具、数据上下文；
 *  ② **人设与记忆进提示词**（C3：设置了人设 ≠ 人设生效）—— 每一轮的输入都带上
 *     `buildAgentSystemPrompt(persona, 相关记忆)`；⚠️ 它与数据上下文**分开两段**传入，
 *     免得人设被当成"用户的真实数据"（见 `loop.ts` 的 `personaBlock` 注释）；
 *     人设是**每次运行现取**的（`pickActivePersona`），所以"换了人设立即生效"
 *     是构造出来的，不需要任何失效通知。
 *  ③ **动作协议文本**由插件规格**生成**（不再硬编码在提问链路里）；
 *  ④ **把过程报到 AgentStatus**：桌宠与进度行都订阅它（单向：Agent → 状态 → 表现）；
 *  ⑤ **确认门的续跑**：`needs-confirmation` 时把 proposal / resume 原样交给面板，
 *     主人点确认后再带着 `seed` 回到这里继续推理。
 *
 * ## 两条诚实的边界
 *  · **没有可用的远程模型时不假装**：本地规则只做"如实概览"，不调工具、不编结果
 *    （规格 §C8：宁可说"尚未连接可用模型"）；
 *  · **本地模式仍然回答**：那是既有能力（把本机数据念给你听），只是标注清楚来源。
 */
import { aiService } from '../../services/ai/ai-service'
import { markAiRemoteDegraded, markAiRemoteReady } from '../../services/ai/health'
import { finishAgentRun, setAgentStatus } from '../../services/agent/status'
import { runAgent, MAX_ITERATIONS, type AgentResume, type AgentRunResult } from '../../services/agent/loop'
import { buildAgentSystemPrompt, pickActivePersona } from '../../services/persona/prompt'
import { selectMemories } from '../../services/memory/select'
import { usePersonaStore } from '../../stores/usePersonaStore'
import { useMemoryStore } from '../../stores/useMemoryStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { describeActionProtocol } from './action-protocol'
import { actionSpecs, agentTools } from './plugins'
import { buildContext } from './context'
import { formatHistory, type ChatMessage } from './chat-history'
import { askLocalOnly } from './tianji-ask'
import type { AIProvider, StreamFinishInfo } from '../../services/ai/provider'

export interface TianjiAgentOptions {
  question: string
  history: ChatMessage[]
  onToken?: (delta: string) => void
  /** 流式结束信息（`reason === 'length'` 表示被截断 —— 面板要如实告诉用户） */
  onFinish?: (info: StreamFinishInfo) => void
  signal?: AbortSignal
  /** 确认后的续跑凭据（来自上一次 `needs-confirmation`） */
  seed?: AgentResume
}

/** 取当前人设（未选 / 已删除 → null → 提示词退回中性语气，不猜一个） */
function activePersona() {
  return pickActivePersona(
    usePersonaStore.getState().items,
    useSettingsStore.getState().activePersonaId,
  )
}

/**
 * 跑一轮天机。
 *
 * 返回 `AgentRunResult`：回答 + 步数 + 结束原因（界面必须能区分
 * "正常答完"与"撞了上限/被中止/模型出错/等你确认"）。
 */
export async function runTianjiAgent(o: TianjiAgentOptions): Promise<AgentRunResult> {
  const provider: AIProvider = aiService.provider
  // ① 没有可用的远程模型：**如实说明**，不伪装（本地规则不能调工具，也不该假装能）
  if (provider.id !== 'remote' || !provider.available()) {
    // 续跑时不再走本地规则：提案已经由用户处理过了，这里只补一句收尾，避免把概览重复念一遍
    const answer = o.seed ? '' : await askLocalOnly(o.question, o.history)
    finishAgentRun('success', { currentTask: '本地规则' })
    return { answer, steps: 1, reason: 'done', trace: [] }
  }

  const persona = activePersona()
  const memories = selectMemories(useMemoryStore.getState().items, o.question)

  const result = await runAgent({
    question: o.question,
    history: formatHistory(o.history),
    // 人设与纪律单独一段；数据上下文另一段（两者语义不同，不能混在一起）
    personaBlock: buildAgentSystemPrompt(persona, memories),
    dataContext: buildContext(o.question),
    // 动作协议文本**由插件规格生成**（加动作只改插件，见 action-protocol.ts）
    extraInstructions: describeActionProtocol(actionSpecs()),
    tools: agentTools(),
    maxIterations: MAX_ITERATIONS,
    signal: o.signal,
    seed: o.seed,
    onToken: o.onToken,
    /**
     * 每一轮都走**流式**（能流就流）：中间的"我先查一下…"与最终回答共用同一条通道，
     * 所以界面看到的文字就是落库文字（与旧链路同一条纪律）。
     */
    complete: (input, onToken, signal) =>
      provider.completeStream
        ? provider.completeStream(input, onToken, signal, o.onFinish)
        : provider.complete(input),
    onEvent: (e) => {
      /**
       * 过程 → AgentStatus（桌宠与进度行都读它；这里是唯一写状态的地方）。
       *
       * ⚠️ `currentTask` **必须与阶段名不同**：进度行的排版是
       * `阶段名 · currentTask`，两处都写"推演中"就会显示成"推演中 · 推演中"
       * （Step 4-2 的实际显示效果）。所以这里给的永远是**具体在做什么**。
       */
      switch (e.type) {
        case 'thinking':
          setAgentStatus({ phase: 'thinking', step: e.step, maxSteps: e.maxSteps, currentTask: '理解任务' })
          break
        case 'tool':
          setAgentStatus({ phase: 'working', currentTool: e.toolId, currentTask: e.toolName, step: e.step })
          break
        case 'tool-done':
          // 只清掉"当前工具"高亮，保留工具名（进度行继续显示刚做完哪一步）
          setAgentStatus({ currentTool: undefined })
          break
        case 'tool-error':
          // 工具失败**不终止**循环（模型会换做法或如实说不确定）；进度行**如实写失败原因**
          setAgentStatus({ phase: 'working', currentTask: `${e.toolName} 未成功`, currentTool: undefined })
          break
        case 'confirm-required':
          // 等主人点确认：桌宠进 waiting（"主人～这里要你点一下"），面板出确认卡片
          setAgentStatus({ phase: 'waiting', currentTool: e.toolId, currentTask: e.toolName, step: e.step })
          break
        case 'answer':
          finishAgentRun('success', { currentTask: '完成' })
          break
      }
    },
  })

  // 远程健康三态（与旧链路同一口径）：成功 → ready；失败 → degraded（面板显示"远程异常"）
  if (result.reason === 'error') markAiRemoteDegraded(result.errorMessage ?? '模型调用失败')
  else if (result.reason !== 'aborted') markAiRemoteReady()

  return result
}
