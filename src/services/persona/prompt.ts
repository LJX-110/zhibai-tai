/**
 * 人设 → 系统提示词（**纯函数**，可单测；Step 4-2 · C3）
 *
 * ## 为什么必须单独成层
 * "设置了人设 ≠ 人设生效"。此前天机的 system prompt 写死在
 * `services/ai/provider.ts`（"你是知白台的 AI 助手…"）—— 设置页存下来的任何人格
 * 都不会进请求。现在链路是：
 *
 * ```
 * 选中的 Persona ──► buildAgentSystemPrompt() ──► provider 的 system 消息 ──► 模型
 * ```
 *
 * 本模块只做"把用户资产翻成提示词"这一件事：不读 store、不认识 React，
 * 因此"人设有没有真的进去"可以被断言（见 `__tests__/persona.test.ts`）。
 *
 * ## 三条纪律（写进提示词，而不是只写在文档里）
 *  1. **未知资料保持 UNKNOWN**：`unknown` 字段原样列出 + 明确禁止补全
 *     （模型很自然会把它补成"事实"，而用户会当真）；
 *  2. **真数据只有一处来源**：只有随消息一起给的数据上下文里的数字/日期是真数据，
 *     其余一律不许编；
 *  3. **安全护栏高于"绝对服从"**：人设里的 OBEY_MASTER_ALWAYS 不能压过安全规则。
 */
import type { Memory, Persona } from '../../types/entities'
import { PERSONA_FIELD_LABELS } from './defaults'

/**
 * 记忆纪律 —— **只有一处**（记忆有 / 没有两条分支共用同一段话）。
 *
 * 最后一句是 Step 4-3 补上的：规格 §C9 要求"检索不到就如实说没找到"。
 * 不写这一句时，模型被问"你记得我吗"会很自然地说"当然记得呀～" ——
 * 而库里什么都没有，用户下次再问又对不上，信任就此崩掉。
 */
const MEMORY_DISCIPLINE = [
  '只有上面明确列出的内容才算"你记住的事"；没有列出的，不要凭印象补。',
  '主人问"你记得吗 / 记不记得 / 之前说过什么"而上面没有相关信息时，**如实说没有找到相关记忆**',
  '（可以补一句"要不要现在记住"）—— 禁止假装记得、禁止临时编一条出来。',
].join('')

/**
 * 从人设清单里取出「当前生效的那一个」（纯函数）。
 *
 * 三个返回 null 的情形，都**不猜一个代替**：没选（空 id）、选了但已被删除、
 * 清单还没加载出来。这时退回中性助手语气 —— 拿另一个人设顶上会让用户
 * 看到"人格自己变了"，比没有人设更糟。
 *
 * 抽出来是为了可断言：装配层每一轮都调它，所以"换人设立即生效"这件事
 * 不需要额外的失效通知 —— 也没必要有。
 */
export function pickActivePersona(
  personas: readonly Persona[],
  activeId: string | null | undefined,
): Persona | null {
  if (!activeId) return null
  return personas.find((p) => p.id === activeId) ?? null
}

/**
 * 组装系统提示词。
 *
 * @param persona 当前选中的人设（null = 没有可用人设，退回中性助手）
 * @param memories 已筛过的长期记忆（**只传启用的**；筛选见 `services/memory/select.ts`）
 */
export function buildAgentSystemPrompt(persona: Persona | null, memories: readonly Memory[]): string {
  const parts: string[] = []

  parts.push(
    [
      '你是「知白台」（个人效率工作台）里的天机 —— 用户的数据管家，也是下面这位人格的化身。',
      '回答用中文，简洁、有条理；先给结论，再给必要的细节。',
    ].join('\n'),
  )

  if (persona) {
    parts.push(`【人设 · ${persona.name}】`)
    for (const f of PERSONA_FIELD_LABELS) {
      const value = String(persona[f.key] ?? '').trim()
      if (!value) continue
      parts.push(`· ${f.label}：\n${value}`)
    }
    parts.push(
      [
        '【人设纪律（按重要性排序）】',
        '1. 未知资料一律保持 UNKNOWN：上面「未知资料」小节里标为未知 / [推断] 的内容，不得当作事实陈述，也不得自行补全；被问到就如实说"资料里没有"。',
        '2. 只有随消息给出的数据上下文里的数字与日期是真数据；那之外的具体事实（地址、口味、作息、经历）不要编造。',
        '3. 「绝对服从主人」只作用于**语气与配合度**，不覆盖安全规则：违法、危险、伤害自己或他人的请求一律拒绝。',
        '4. 保持人格的语言特征（自称、称呼、短句、尾鳍式表达），但**不要为了演人格牺牲信息准确性**。',
      ].join('\n'),
    )
  } else {
    parts.push('（未选择人设：以中性、克制的助手语气回答。）')
  }

  if (memories.length > 0) {
    parts.push(
      [
        '【长期记忆（主人明确让你记住的事）】',
        ...memories.map((m) => `· ${m.text}`),
        '这些是你可以当作"已知"的事；记忆里没有的，不要凭印象补。',
        MEMORY_DISCIPLINE,
      ].join('\n'),
    )
  } else {
    // 刻意不写"暂无记忆"：那会与"记忆里有但这次没命中"混淆 ——
    // 只留纪律，模型就既不会编、也不会把"没给"读成"没有"
    parts.push(`【记忆纪律】${MEMORY_DISCIPLINE}`)
  }

  return parts.join('\n\n')
}