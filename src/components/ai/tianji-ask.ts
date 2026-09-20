/**
 * 天机的提问链路：远程就绪走完整问答（携带本次会话历史做多轮上下文），
 * 否则本地概述（绝不报错打断）。传入 stream 时优先走 provider 的流式补全，
 * 边生成边回调；provider 不支持则自动回退一次性。
 *
 * 兜底不静默：远程**调用失败**与远程**从未配置**是两件事，走 `localFallback`
 * 的两套文案，并同步 `markAiRemoteDegraded` 让面板显示「远程异常」——
 * 用户得知道自己看到的是本地概览而不是模型输出。
 */
import { aiService } from '../../services/ai/ai-service'
import { markAiRemoteDegraded, markAiRemoteReady, reasonOf } from '../../services/ai/health'
import { createId } from '../../utils/id'
import { buildContext } from './context'
import type { ChatMessage } from './chat-history'

/** 动作协议：让模型在「创建类」意图明确时，于回答**末尾**附 ```json 动作块```，
 *  由面板解析成预览卡片、用户确认后才落库（绝不让模型一句话直接写数据）。 */
const ACTION_PROTOCOL = `当你判断用户明确想"创建/新建/加/记"某样东西（待办、笔记、收支），且关键信息齐全时，可在自然语言回答**之后**附一个 \`\`\`json 代码块\`\`\` 提议动作（一条消息最多一个动作块；信息不足就不要创建）：
{"action":"create_task","title":"待办标题","priority":"high|mid|low（可选，默认 mid）","dueDate":"yyyy-mm-dd（可选）"}
{"action":"create_note","title":"笔记标题","body":"正文（可选）"}
{"action":"create_finance","kind":"expense|income","amount":正数,"category":"分类","note":"备注（可选）","date":"yyyy-mm-dd（可选，默认今天）"}
重要：只创建、绝不删除或改写已有数据；代码块之外仍要用中文自然语言说明你要做什么，最终由用户点"确认"才真正写入。`

export async function ask(
  prompt: string,
  history: ChatMessage[],
  stream?: { onToken: (delta: string) => void; signal?: AbortSignal },
): Promise<string> {
  const ctx = buildContext(prompt)
  const provider = aiService.provider
  if (provider.id === 'remote' && provider.available()) {
    // 长会话压缩：超过 MAX_HISTORY 轮后，把最早的部分压成一条摘要占位，
    // 避免 prompt 过长吞掉上下文预算（天机不会"失忆式"爆长）
    const MAX_HISTORY = 12
    let usable = history
    if (history.length > MAX_HISTORY) {
      const head = history.slice(0, history.length - MAX_HISTORY)
      const tail = history.slice(-MAX_HISTORY)
      const digest = head
        .map((m) => `${m.role === 'user' ? '问' : '答'}：${m.content.replace(/\s+/g, ' ').slice(0, 40)}`)
        .join('；')
      usable = [{ id: createId(), role: 'ai', content: `（更早的对话已压缩）${digest}…` }, ...tail]
    }
    const historyText = usable
      .slice(-MAX_HISTORY)
      .map((m) => `${m.role === 'user' ? '用户' : '天机'}：${m.content}`)
      .join('\n')
    const full = `以下是知白台用户今日的真实数据（用于回答与用户生活/任务相关的问题）：\n${ctx}\n\n对话历史：\n${historyText || '（本会话第一条提问）'}\n\n用户当前问题：${prompt}\n\n要求：中文回答，简洁有条理；问及课程安排、作业、考试、收支、项目、收藏等具体信息时，必须引用上方明细里的**具体时间 / 课程名 / 金额 / 日期**作答，不要只报总数；上方数据里没有的信息，如实说"当前数据里没有"，不要编造；与数据无关的通用问题正常回答；能结合对话历史延续上下文。\n\n${ACTION_PROTOCOL}`
    try {
      const text =
        stream && provider.completeStream
          ? await provider.completeStream(full, stream.onToken, stream.signal)
          : await provider.complete(full)
      markAiRemoteReady()
      return text
    } catch (err) {
      // 用户主动中止：直接抛出，不要走下面的"降级为本地概述"
      // —— 否则中止后会突然冒出一段本地生成的假回答
      if (stream?.signal?.aborted) throw err
      // 远程失败（超时/限流/Key 失效）降级为本地概述，但**必须留痕**：
      // 状态标成 degraded 让面板显示「远程异常」，文案也要说清是"失败"而不是"没配置"
      // —— 这两件事对用户含义完全不同，混成一句话就是在骗他。
      const reason = reasonOf(err)
      markAiRemoteDegraded(reason)
      return localFallback(ctx, prompt, reason)
    }
  }
  return localFallback(ctx, prompt)
}

/**
 * 本地兜底文案。
 * `failed` 有值 = 远程「调用失败」；无值 = 远程「从未配置」—— 两者的下一步动作不一样，
 * 所以文案不能共用一句。
 */
function localFallback(ctx: string, prompt: string, failed?: string): string {
  const head = failed ? `（远程 AI 暂时不可用：${failed}）已退回本地概览` : '（本地规则 · 未接入远程 AI）'
  const tail = failed
    ? '把问题原样再发一次即可重试；若持续失败，请检查「系统 · AI Core」里的 Key、额度与 Base URL。'
    : '在「系统 · AI Core」配置远程 AI（Base URL / 模型 / Key）后，可针对你的数据得到完整的分析与建议。'
  return `${head}\n基于你的数据：\n${ctx}\n\n你问的是：「${prompt}」\n\n${tail}`
}
