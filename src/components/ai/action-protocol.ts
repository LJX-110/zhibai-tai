/**
 * 天机「可执行动作」协议 —— 纯解析层（无 store / DOM 依赖，可单测）
 *
 * 约定：模型在回答**末尾**附一个 ```json 围栏块```，块内是单条或数组形式的动作对象。
 * 面板只在回答收齐后调用本模块解析；流式过程中不解析（增量 JSON 不可校验）。
 * 解析失败 / 缺必填 / 未知类型：一律跳过——绝不报错、绝不渲染空卡片。
 */
import type { Priority } from '../../types/entities'

/** 经解析、已规整的动作（可直接落库或预览） */
export type TianjiActionPayload =
  | { action: 'create_task'; title: string; priority: Priority; dueDate: string | null }
  | { action: 'create_note'; title: string; body: string; tags: string[] }
  | { action: 'create_finance'; kind: 'expense' | 'income'; amount: number; category: string; note: string; date: string | null }

// 第一版只做创建类动作：破坏性（删除/修改）绝不由模型一句话触发
const PRIORITIES: Priority[] = ['low', 'mid', 'high']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 校验 yyyy-mm-dd 且不是溢出日期（如 2026-02-30 会被 Date 折成 3 月，需拦掉） */
function normDate(s: unknown): string | null {
  if (typeof s !== 'string') return null
  if (!DATE_RE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) return null
  return s
}

function asTask(raw: Record<string, unknown>): TianjiActionPayload | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return null // 缺标题落不了库，直接丢弃候选
  const priority = (PRIORITIES as string[]).includes(raw.priority as string)
    ? (raw.priority as Priority)
    : 'mid'
  return { action: 'create_task', title, priority, dueDate: normDate(raw.dueDate) }
}

function asNote(raw: Record<string, unknown>): TianjiActionPayload | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return null
  const body = typeof raw.body === 'string' ? raw.body : ''
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : []
  return { action: 'create_note', title, body, tags }
}

function asFinance(raw: Record<string, unknown>): TianjiActionPayload | null {
  const kind = raw.kind === 'income' ? 'income' : raw.kind === 'expense' ? 'expense' : null
  if (!kind) return null
  const amount = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null // 金额必须为正才落库
  const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : '未分类'
  const note = typeof raw.note === 'string' ? raw.note : ''
  return { action: 'create_finance', kind, amount: Math.round(amount * 100) / 100, category, note, date: normDate(raw.date) }
}

function normalize(raw: Record<string, unknown>): TianjiActionPayload | null {
  switch (raw.action) {
    case 'create_task':
      return asTask(raw)
    case 'create_note':
      return asNote(raw)
    case 'create_finance':
      return asFinance(raw)
    default:
      return null // 非创建类 / 未知动作：第一版忽略，不渲染
  }
}

/** 从模型回答抽出动作候选。只认 ``` 围栏里的 JSON（单条或数组皆可）。 */
export function parseTianjiActions(text: string): TianjiActionPayload[] {
  if (typeof text !== 'string') return []
  const out: TianjiActionPayload[] = []
  const fence = /```(?:[a-zA-Z0-9_-]*)?\s*\n?([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = fence.exec(text)) !== null) {
    const body = m[1].trim()
    if (!body) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      continue // 非 JSON 围栏（如代码样例）跳过
    }
    const items = Array.isArray(parsed) ? parsed : [parsed]
    for (const it of items) {
      if (!isObj(it) || typeof it.action !== 'string') continue
      const a = normalize(it)
      if (a) out.push(a)
    }
  }
  return out
}
