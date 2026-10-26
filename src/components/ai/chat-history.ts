/**
 * 天机会话历史的本地存档
 * 存 localStorage 而非业务表：历史不参与跨设备同步（天机 = 内置小 agent，
 * 换页/重开/刷新都保留对话，只在点「新对话」时清空）。
 *
 * ## 历史里现在也存**工具轨迹**
 * 上一版只存 user / ai 两行文字，于是工具调用与结果在当轮用完即弃 ——
 * 下一轮模型看不到"上一句它到底查了什么、查到什么"。后果是跨消息指代断裂：
 * 用户说"那先帮我把作业安排到晚上八点"，模型不知道"它"指的是上一轮查出来的哪件作业。
 *
 * 现在每条 AI 消息带一份 `trace`（工具 id / 名称 / 成败 / 一句话结果摘要），
 * `formatHistory` 把它压成一行并进历史。**仍然只存 localStorage** ——
 * 聊天会话是本地设备数据，长期记忆才是可同步的 `memories` 表（规格 §C9）。
 */
import { createId } from '../../utils/id'
import { stripProtocolBlocks } from '../../services/agent/protocol-text'

/** 一轮里真实发生过的一次工具调用（摘要已截断，不是开发者格式） */
export interface ChatTrace {
  toolId: string
  toolName: string
  ok: boolean
  /** 一句话结果（成功取结果首行，失败取错误信息） */
  summary: string
}

export interface ChatMessage {
  /** 稳定 id：用作列表 key，避免以数组下标作 key 在追加/重排时状态错配；旧存档缺 id 时由 loadHistory 幂等补齐 */
  id: string
  role: 'user' | 'ai'
  content: string
  /** 本轮真实调用过的工具（只有 AI 消息有；旧存档没有 = 当轮没调工具） */
  trace?: ChatTrace[]
}

const HISTORY_KEY = 'zbt:ai-chat:v1'
const HISTORY_MAX = 60
/**
 * 存档字符预算。长会话 + 旧版存下来的原始动作 JSON 会把上下文顶爆，
 * 表现是模型侧 400 / 超时（用户只看到"偶发报错"）。截到末尾这段够维持指代。
 */
const HISTORY_CHARS_MAX = 24_000

function normalizeTrace(raw: unknown): ChatTrace[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ChatTrace[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const t = item as Partial<ChatTrace>
    if (typeof t.toolId !== 'string' || typeof t.toolName !== 'string') continue
    if (typeof t.summary !== 'string') continue
    out.push({ toolId: t.toolId, toolName: t.toolName, ok: t.ok === true, summary: t.summary })
  }
  return out.length > 0 ? out : undefined
}

/** 旧存档校验：坏条目丢弃，不让 `undefined.content` 在后面的清洗里炸掉整条链路 */
function normalizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Partial<ChatMessage>
  if (m.role !== 'user' && m.role !== 'ai') return null
  if (typeof m.content !== 'string') return null
  const trace = normalizeTrace(m.trace)
  const content = m.role === 'ai' ? stripProtocolBlocks(m.content) : m.content
  if (!content.trim() && !trace) return null
  return {
    id: typeof m.id === 'string' && m.id ? m.id : createId(),
    role: m.role,
    content,
    ...(trace ? { trace } : {}),
  }
}

/** 从末尾往前保留，直到超预算（最后一条无论多长都留，否则会话会空掉） */
function withinBudget(messages: ChatMessage[]): ChatMessage[] {
  let total = 0
  const out: ChatMessage[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (out.length > 0 && total + m.content.length > HISTORY_CHARS_MAX) break
    total += m.content.length
    out.unshift(m)
  }
  return out
}

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      return withinBudget(
        parsed
          .slice(-HISTORY_MAX)
          .map(normalizeMessage)
          .filter((m): m is ChatMessage => m !== null),
      )
    }
  } catch {
    /* 存档损坏视为空会话 */
  }
  return []
}

export function saveHistory(messages: ChatMessage[]): void {
  try {
    const clean = messages
      .map((m) =>
        m.role === 'ai' ? { ...m, content: stripProtocolBlocks(m.content) } : m,
      )
      .filter((m) => m.content.trim().length > 0 || (m.trace?.length ?? 0) > 0)
      .slice(-HISTORY_MAX)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(withinBudget(clean)))
  } catch {
    /* 存储满/隐私模式下写不进去就放弃存档，不影响对话 */
  }
}

/** 送给模型的历史轮数上限（再多也没有边际收益，只会吃 prompt 预算） */
const MAX_HISTORY_TURNS = 12

/** 工具轨迹 → 一行（`（本轮用了：查待办→3 条未完成；记住这件事→等确认）`） */
function formatTrace(trace: readonly ChatTrace[]): string {
  if (trace.length === 0) return ''
  const parts = trace.map((t) => `${t.toolName}→${t.ok ? t.summary || '已完成' : `失败：${t.summary}`}`)
  return `（本轮用了：${parts.join('；')}）`
}

/**
 * 会话历史 → 提示词文本（从 `tianji-ask` 搬到这里）。
 *
 * 超过上限时把最早的若干轮压成一条摘要占位 —— 天机不会"失忆式"爆长：
 * 长会话仍然知道前面聊过什么，只是细节被收成一行。改写由这一处负责，
 * 提问链路（`agent-run`）只负责调用。
 */
export function formatHistory(messages: readonly ChatMessage[]): string {
  if (messages.length === 0) return ''
  let usable: readonly ChatMessage[] = messages
  if (messages.length > MAX_HISTORY_TURNS) {
    const head = messages.slice(0, messages.length - MAX_HISTORY_TURNS)
    const tail = messages.slice(-MAX_HISTORY_TURNS)
    const digest = head
      .map((m) => {
        const text = m.role === 'ai' ? stripProtocolBlocks(m.content) : m.content
        return `${m.role === 'user' ? '问' : '答'}：${text.replace(/\s+/g, ' ').slice(0, 40)}`
      })
      .join('；')
    usable = [{ id: 'digest', role: 'ai', content: `（更早的对话已压缩）${digest}…` }, ...tail]
  }
  return usable
    .map((m) => {
      // 落库前已清洗过；这里再兜一次，保证旧消息 / 手工构造的消息也不会把 JSON 喂回模型
      const content = m.role === 'ai' ? stripProtocolBlocks(m.content) : m.content
      const trace = formatTrace(m.trace ?? [])
      const head = `${m.role === 'user' ? '用户' : '天机'}：${content}`
      return trace ? `${head}\n${trace}` : head
    })
    .filter((line) => line.trim() !== '天机：' && line.trim() !== '用户：')
    .join('\n')
}
