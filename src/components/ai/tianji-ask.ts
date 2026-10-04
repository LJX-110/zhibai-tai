/**
 * 本地兜底回答 —— **没有可用远程模型时**的唯一出口
 *
 * ## Step 4-2 收窄说明
 * 本文件此前是"天机的提问链路"：远程调用 + 多轮历史拼接 + **硬编码的动作协议文本**
 * （三个动作的 JSON 示例写死在这里）。现在这三件事都搬了家：
 *  · 远程调用与多轮循环 → `services/agent/loop.ts`（真正的 Agent Loop，由
 *    `components/ai/agent-run.ts` 装配）；
 *  · 动作协议文本 → `components/ai/action-protocol.ts` 的 `describeActionProtocol`
 *    （**由插件规格生成**，"加动作只改插件"这才成立）；
 *  · 历史压缩 → `chat-history.ts` 的 `formatHistory`。
 *
 * 留在这里的是**唯一不该由模型决定的事**：本地规则怎么如实说话 ——
 * 它不调工具、不编造，只把真实数据念清楚，并说明"这是本地概览"。
 * 规格 §C8 要求"没有模型时诚实显示"，这段文案就是那句话的落点。
 */
import { buildContext } from './context'

/** 本地兜底文案（未接模型 / 远程失败两种情形分开说，下一步动作不同） */
export async function askLocalOnly(question: string, _history?: unknown): Promise<string> {
  void _history // 本地规则不需要多轮历史：它只是数据的结构化复述
  // buildContext 本身**始终**含基础概览（待办 / 收支 / 饮水 / 课表 / 情报），
  // 并按问题关键词补明细 —— 所以本地模式并非"什么都答不了"，
  // 2026-10-02 起把这句话与"能直接查什么"写在前面，读起来先有结论再有数据。
  const ctx = buildContext(question)
  return [
    `你问的是：「${question}」`,
    '',
    '（本地规则 · 尚未连接可用模型）—— 下面把本机数据如实列出，不做推理、不调工具。',
    '能直接查的：今天有什么课 / 本月支出 / 还有哪些作业没交。',
    '',
    ctx,
    '',
    '在「系统 · AI · 模型与连接」填好 Base URL / 模型 / API Key（DeepSeek、Kimi、Agnes 都允许浏览器直连），即可用完整的天机。',
  ].join('\n')
}