/**
 * 天机「可执行动作」协议 —— **通用解析引擎**（纯函数，无 store / DOM 依赖，可单测）
 *
 * ## 2026-09-22 开放化重写（P2）
 * 此前本文件**硬编码**了动作名 union + 三个 normalizer + 一个 switch：
 * 加一种动作（比如"记一笔体重"）必须回来改这里，协议因此成了瓶颈。
 * 现在改为**字段规格驱动**：动作的中文名、字段规格、落库、预览全部由**归属插件申报**
 * （见 `plugins/index.ts` 的 `TianjiActionDef`），本文件只做通用的校验与规整。
 * **加新动作不必再改本文件。**
 *
 * ## 不变的约定
 *  · 模型在回答**末尾**附一个 ```json 围栏块```，块内是单条或数组形式的动作对象；
 *  · 面板只在回答收齐后解析（流式期间增量 JSON 不可校验，解析是被明确禁止的）；
 *  · 解析失败 / 缺必填 / 未知动作：**一律跳过** —— 绝不报错、绝不渲染空卡片。
 *
 * ⚠️ 本文件不认识任何具体动作名。**别把"待办/笔记/收支"这类字样加回来** ——
 * 那正是这次重写要消除的东西。
 */

/** 规整后的字段值（已通过校验） */
export type ActionValue = string | number | string[] | null
export type ActionFields = Record<string, ActionValue>

/** 经解析、已规整的动作（可直接落库或渲染预览） */
export interface TianjiActionPayload {
  /** 动作名（模型在 JSON 里写的那个，如 `create_task`） */
  action: string
  /** 按所属插件申报的规格规整过的字段 */
  fields: ActionFields
}

/**
 * 字段规格 —— 协议据此**通用**校验与规整。
 * 新增字段类型时只加一个分支，不必碰任何动作。
 */
export type FieldSpec =
  /** 文本。`required` 时空白即判失败（缺标题落不了库） */
  | { kind: 'text'; required?: boolean; fallback?: string }
  /** 金额：必须是有限正数，规整到分 */
  | { kind: 'amount' }
  /** 日期：yyyy-mm-dd，且**不是溢出日期**（2026-02-30 会被 Date 折成 3 月，需拦掉） */
  | { kind: 'date' }
  /** 枚举：不在候选内取 `fallback`；没有 fallback 则判失败 */
  | { kind: 'choice'; values: readonly string[]; fallback?: string }
  /** 字符串数组（过滤掉非字符串项） */
  | { kind: 'textList' }

/** 动作规格：由归属插件申报 */
export interface TianjiActionSpec {
  /** 字段名 → 字段规格 */
  fields: Record<string, FieldSpec>
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 校验 yyyy-mm-dd 且不是溢出日期（仅本文件用） */
function normDate(s: unknown): string | null {
  if (typeof s !== 'string') return null
  if (!DATE_RE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) return null
  return s
}

/** 按规格校验单个字段；返回 `undefined` 表示**该字段校验失败**（整条动作作废） */
function checkField(spec: FieldSpec, raw: unknown): ActionValue | undefined {
  switch (spec.kind) {
    case 'text': {
      const s = typeof raw === 'string' ? raw.trim() : ''
      if (!s) {
        if (spec.required) return undefined
        return spec.fallback ?? ''
      }
      return s
    }
    case 'amount': {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n) || n <= 0) return undefined
      return Math.round(n * 100) / 100
    }
    case 'date':
      // 日期一律可选：写了非法值就退回"未设"，不因此作废整条动作
      return normDate(raw)
    case 'choice': {
      const s = typeof raw === 'string' ? raw : ''
      if (spec.values.includes(s)) return s
      return spec.fallback !== undefined ? spec.fallback : undefined
    }
    case 'textList':
      return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : []
  }
}

/**
 * 按规格规整一条动作。**规格里没有的字段一律丢弃** ——
 * 模型多写字段不该影响落库，更不该被原样透传进数据库。
 */
function normalizeAction(
  raw: Record<string, unknown>,
  spec: TianjiActionSpec,
): TianjiActionPayload | null {
  const fields: ActionFields = {}
  for (const [name, fieldSpec] of Object.entries(spec.fields)) {
    const v = checkField(fieldSpec, raw[name])
    if (v === undefined) return null
    fields[name] = v
  }
  return { action: String(raw.action), fields }
}

/**
 * 从模型回答抽出动作候选。只认 ``` 围栏里的 JSON（单条或数组皆可）。
 *
 * @param specs 动作名 → 规格；**只解析已申报的动作**，未申报的静默跳过
 */
export function parseTianjiActions(
  text: string,
  specs: Record<string, TianjiActionSpec>,
): TianjiActionPayload[] {
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
      const spec = specs[it.action]
      if (!spec) continue // 未申报的动作：不渲染、不报错
      const a = normalizeAction(it, spec)
      if (a) out.push(a)
    }
  }
  return out
}

/** 从字段里取文本（插件预览用；缺省返回空串） */
export function textOf(f: ActionFields, key: string): string {
  const v = f[key]
  return typeof v === 'string' ? v : ''
}

/** 从字段里取数字（插件预览用；缺省返回 0） */
export function numberOf(f: ActionFields, key: string): number {
  const v = f[key]
  return typeof v === 'number' ? v : 0
}

/** 从字段里取字符串数组（插件预览用；缺省返回空数组） */
export function listOf(f: ActionFields, key: string): string[] {
  const v = f[key]
  return Array.isArray(v) ? v : []
}
