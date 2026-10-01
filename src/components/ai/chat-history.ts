/**
 * 天机会话历史的本地存档
 * 存 localStorage 而非业务表：历史不参与跨设备同步（天机 = 内置小 agent，
 * 换页/重开/刷新都保留对话，只在点「新对话」时清空）。
 *
 * ## Step 4-3 · 五：历史里现在也存**工具轨迹**
 * 上一版只存 user / ai 两行文字，于是工具调用与结果在当轮用完即弃 ——
 * 下一轮模型看不到"上一句它到底查了什么、查到什么"。后果是跨消息指代断裂：
 * 用户说"那先帮我把作业安排到晚上八点"，模型不知道"它"指的是上一轮查出来的哪件作业。
 *
 * 现在每条 AI 消息带一份 `trace`（工具 id / 名称 / 成败 / 一句话结果摘要），
 * `formatHistory` 把它压成一行并进历史。**仍然只存 localStorage** ——
 * 聊天会话是本地设备数据，长期记忆才是可同步的 `memories` 表（规格 §C9）。
 */
import { createId } from '../../utils/id'

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

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      // 旧存档的 ChatMessage 没有 id 字段（历史兼容）：补齐稳定 id，保证列表 key 稳定、不重复
      return (parsed as Array<Partial<ChatMessage>>)
        .slice(-HISTORY_MAX)
        .map((m) => ({ ...m, id: m.id ?? createId() }) as ChatMessage)
    }
  } catch {
    /* 存档损坏视为空会话 */
  }
  return []
}

export function saveHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_MAX)))
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
 * 会话历史 → 提示词文本（Step 4-2：从 `tianji-ask` 搬到这里）。
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
      .map((m) => `${m.role === 'user' ? '问' : '答'}：${m.content.replace(/\s+/g, ' ').slice(0, 40)}`)
      .join('；')
    usable = [{ id: 'digest', role: 'ai', content: `（更早的对话已压缩）${digest}…` }, ...tail]
  }
  return usable
    .map((m) => {
      const trace = formatTrace(m.trace ?? [])
      const head = `${m.role === 'user' ? '用户' : '天机'}：${m.content}`
      return trace ? `${head}\n${trace}` : head
    })
    .join('\n')
}
