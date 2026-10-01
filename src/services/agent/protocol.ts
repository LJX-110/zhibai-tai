/**
 * Agent · 工具调用协议（文本协议，**纯函数**；Step 4-2 · C5）
 *
 * ## 为什么是文本协议而不是 `tools` 参数
 * 本项目的 Provider 是**纯文本进出**（`complete` / `completeStream`，见 provider.ts 与
 * `docs/方案与实现.md` §2.3），这是刻意保留的边界：换任何 OpenAI 兼容端点都能用。
 * 所以工具调用通过**提示词约定**表达：模型在回答里附一个 `json` 围栏块，
 * 形如 `{"tool":"tasks.search","args":{"query":"报销"}}`；宿主解析后执行，
 * 把结果**当成新一轮输入**喂回去 —— 这才是 Agent Loop 的实质
 * （多轮：LLM → 工具 → 结果 → LLM），与用不用原生 tools 字段无关。
 *
 * ## 三条纪律
 *  ① **只在收齐后解析**：流式增量里的 JSON 不完整，绝不中途解析（沿用动作协议的老规矩）；
 *  ② **一次一个工具**：并行调用会让"结果回喂"的因果变得难以解释，也难做确认门；
 *  ③ **未知工具不执行**：解析出没申报的名字时，把"工具不存在"如实回喂给模型，
 *     而不是猜一个相近的 —— 猜测会让它在幻觉上继续幻觉。
 */
import type { AgentTool } from './tools'

/** 解析出的工具调用 */
export interface ToolCall {
  id: string
  args: Record<string, unknown>
}

/**
 * 提示词里的协议说明。
 *
 * ⚠️ 与动作协议**同时**出现在提示词里：模型要能区分"能自己做的"（工具）与
 * "必须请主人点确认的"（动作）。两段说明的顺序固定（工具在前），
 * 因为先有事实、再谈写入。
 */
export const TOOL_PROTOCOL = `【工具协议】
需要真实数据、或要替主人做一件小事时，先调用工具，再据此回答。格式是：在回答**末尾**附一个 \`\`\`json 代码块\`\`\`：
{"tool":"工具id","args":{"参数名":"值"}}
规则：
1. 一次只调用一个工具；拿到结果后我会把结果给你，你再决定是继续调用还是给出回答。
2. 信息够了就直接回答，不要为了"完整性"反复调用工具。
3. 只使用上面列出的工具 id；不确定就如实说不知道，**绝不编造工具结果**。
4. 调用工具前可以用一句自然语言说明你要做什么（那部分会被用户看到）。
5. **注意两类工具的差别**：【可用工具】调用后立即执行、结果会回给你；
   【需要主人确认的工具】调用后**不会立刻生效** —— 我会给你一张确认卡片，等主人点确认。
   这类工具被调用后，你要说"我建议…，等你点一下确认"，**不要说"已经做好了"**。
6. 能自己做完的小事（记一条待办、记一条笔记）请直接用【可用工具】做完，
   不要只在回答里说"我可以帮你记"却不调用工具。`

/**
 * 从回答里剥掉工具调用围栏（用于把"给用户看的文字"与"给宿主看的指令"分开）。
 * 与 `action-text.stripActionFences` 同一思路：**渲染层看到的永远是干净的正文**。
 */
export function stripToolFences(text: string): string {
  return text.replace(/```json\s*\{[\s\S]*?"tool"[\s\S]*?\}\s*```/g, '').trim()
}

/**
 * 解析回答末尾的工具调用。
 *
 * 采取"**最后一个**匹配的围栏块"：模型有时会在解释里举例，最后一个才是它真正要执行的。
 * 解析失败 / 没有 `tool` 字段 → 返回 null（此时这段话就是最终回答）。
 */
export function parseToolCall(text: string, tools: readonly AgentTool[]): ToolCall | null {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
  for (let i = blocks.length - 1; i >= 0; i--) {
    const raw = blocks[i][1]?.trim()
    if (!raw || !raw.includes('"tool"')) continue
    try {
      const parsed = JSON.parse(raw) as { tool?: unknown; args?: unknown }
      if (typeof parsed.tool !== 'string' || !parsed.tool.trim()) continue
      const id = parsed.tool.trim()
      // 未申报的工具**不执行**：回喂"工具不存在"，让模型改用已申报的或如实回答
      const known = tools.some((t) => t.id === id)
      if (!known) return { id: `__unknown__:${id}`, args: {} }
      const args =
        parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
          ? (parsed.args as Record<string, unknown>)
          : {}
      return { id, args }
    } catch {
      // 这一个块不是合法 JSON：继续往前找（可能是正文里的示例）
      continue
    }
  }
  return null
}

/** 把工具结果拼成回喂给模型的一段（纯函数，便于断言格式稳定） */
export function formatToolResult(id: string, result: { text: string; count?: number }): string {
  const head = `【工具结果 · ${id}】${result.count !== undefined ? `（${result.count} 条）` : ''}`
  return `${head}\n${result.text}`
}

/** 未知工具的回喂文案（**如实说明**，不让模型继续猜） */
export function unknownToolFeedback(id: string): string {
  return `【工具结果 · ${id}】工具不存在：请改用【可用工具】里列出的 id，或直接如实回答。`
}

/** 工具执行异常的回喂文案（模型据此换做法或如实报错，而不是假装成功） */
export function toolErrorFeedback(id: string, message: string): string {
  return `【工具结果 · ${id}】执行失败：${message}。请如实告诉用户这次没查到/没做成，不要编造内容。`
}