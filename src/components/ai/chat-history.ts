/**
 * 天机会话历史的本地存档
 * 存 localStorage 而非业务表：历史不参与跨设备同步（天机 = 内置小 agent，
 * 换页/重开/刷新都保留对话，只在点「新对话」时清空）。
 */
import { createId } from '../../utils/id'

export interface ChatMessage {
  /** 稳定 id：用作列表 key，避免以数组下标作 key 在追加/重排时状态错配；旧存档缺 id 时由 loadHistory 幂等补齐 */
  id: string
  role: 'user' | 'ai'
  content: string
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
