/**
 * 协议块的**统一扫描与剥离** —— 工具块与动作块共用这一份
 *
 * ## 为什么必须收成一处
 * 此前有三套各自为政的正则：
 *  · `services/agent/protocol.ts` 的 `stripToolFences` 只认小写 ```json + `{` + `"tool"`；
 *  · `components/ai/action-text.ts` 的 `stripActionFences` 只认**闭合**围栏；
 *  · `components/ai/action-protocol.ts` 的 `parseTianjiActions` 又自己扫一遍。
 * 三套规则的容错范围不同，于是同一条回答会出现"气泡里还露着 JSON、解析却没抽到"；
 * 更糟的是流式预览走的是原文，模型刚吐到一半的 `{"action":…}` 会直接上屏。
 *
 * 现在只留一个扫描器：**先找出所有 JSON 块（围栏 / 裸 JSON），再由调用方决定去掉哪些**。
 * 渲染、落库、解析都读同一份结果，"预览干净、历史脏"这类漂移在构造上就不成立。
 *
 * ## 认什么
 *  · 围栏：```json / ```JSON / ``` / ``` javascript 都行；未闭合也算一个块；
 *  · 裸 JSON：模型偶尔会忘记围栏，只要它是合法 JSON 就认；
 *  · 协议块：对象里有 string 类型的 `tool` 或 `action`，或数组里存在这样的对象。
 *
 * ## 不认什么
 *  · 标注成 js / ts 的代码样例、正文里引用的一般 JSON（没有 tool/action）——
 *    它们原样保留，清洁只针对协议泄漏。
 */

/** 一个被扫描到的 JSON 块（围栏或裸块） */
export interface JsonBlock {
  /** 原文起始下标（围栏块含开围栏） */
  start: number
  /** 原文结束下标（不含）；未闭合围栏到文本末尾 */
  end: number
  fenced: boolean
  closed: boolean
  /** 去空白后的原始内容（围栏内 / 裸块本身）；解析成功时为空串以外仍保留 */
  raw: string
  /** 解析成功时的值；失败为 undefined */
  value?: unknown
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function tryParse(raw: string): { ok: true; value: unknown } | { ok: false } {
  const text = raw.trim()
  if (!text) return { ok: false }
  // 只接受对象 / 数组：`1` / `"x"` 这类标量不是协议块，也不该被当成 JSON 处理
  if (text[0] !== '{' && text[0] !== '[') return { ok: false }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

/** 对象里有字符串 tool/action，或数组里存在这样的对象 */
export function isProtocolPayload(value: unknown): boolean {
  const one = (v: unknown) =>
    isObj(v) && (typeof v.tool === 'string' || typeof v.action === 'string')
  return Array.isArray(value) ? value.some(one) : one(value)
}

/** 围栏里的内容看起来像协议（用于"JSON 被截断、解析必然失败"时也要藏起来） */
function looksProtocolRaw(raw: string): boolean {
  return /"(?:tool|action)"\s*:/.test(raw)
}

/** 扫围栏块；未闭合的块保留 `closed: false`，让上层能把残尾裁掉 */
function scanFences(text: string): JsonBlock[] {
  const out: JsonBlock[] = []
  const re = /```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const bodyStart = m.index + m[0].length
    const close = text.indexOf('```', bodyStart)
    const closed = close !== -1
    const bodyEnd = closed ? close : text.length
    const raw = text.slice(bodyStart, bodyEnd)
    const parsed = closed ? tryParse(raw) : { ok: false as const }
    out.push({
      start: m.index,
      end: closed ? close + 3 : text.length,
      fenced: true,
      closed,
      raw,
      value: parsed.ok ? parsed.value : undefined,
    })
    if (!closed) break
    re.lastIndex = bodyEnd + 3
  }
  return out
}

/**
 * 从 `start` 起读一个配平的 JSON 值，返回结束下标（不含）；读不完返回 -1。
 * 只做括号与字符串状态跟踪 —— 能否解析交给 `JSON.parse`，这里不重复实现语法。
 */
function readBalanced(text: string, start: number): number {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** 扫裸 JSON。只从 `{` / `[` 起尝试，且必须真的 parse 成功 —— 正文里出现一个花括号不会被误判 */
function scanBare(text: string, offset: number): JsonBlock[] {
  const out: JsonBlock[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '{' || c === '[') {
      const end = readBalanced(text, i)
      if (end > 0) {
        const parsed = tryParse(text.slice(i, end))
        if (parsed.ok) {
          out.push({
            start: offset + i,
            end: offset + end,
            fenced: false,
            closed: true,
            raw: text.slice(i, end),
            value: parsed.value,
          })
          i = end
          continue
        }
      }
    }
    i++
  }
  return out
}

/** 找出文本里的全部 JSON 块（围栏 + 围栏之外的裸 JSON），按位置排序 */
export function collectJsonBlocks(text: string): JsonBlock[] {
  if (typeof text !== 'string' || text.length === 0) return []
  const fences = scanFences(text)
  const out: JsonBlock[] = [...fences]
  let cursor = 0
  for (const f of fences) {
    if (f.start > cursor) out.push(...scanBare(text.slice(cursor, f.start), cursor))
    cursor = f.end
  }
  if (cursor < text.length) out.push(...scanBare(text.slice(cursor), cursor))
  return out.sort((a, b) => a.start - b.start)
}

/** 未闭合围栏的起点（按三反引号出现次数的奇偶判断）；没有则 -1 */
function openFenceStart(text: string): number {
  let count = 0
  let last = -1
  let i = 0
  while ((i = text.indexOf('```', i)) !== -1) {
    count++
    last = i
    i += 3
  }
  return count % 2 === 1 ? last : -1
}

/**
 * 末尾没写完的裸 JSON：`{"tool":"tasks.se` 这种残尾在流式期间每 60ms 都会出现一次，
 * 必须从 `{` 处裁掉，否则用户会看到半截代码。只认"以 `{`/`[` 开头、后面紧跟引号"的尾巴，
 * 避免把正文里的普通花括号也削掉。
 */
function trimDanglingJson(text: string): string {
  const re = /[[{][ \t\r\n]*"/g
  let match: RegExpExecArray | null
  let last = -1
  while ((match = re.exec(text)) !== null) last = match.index
  if (last < 0) return text
  // 括号已经配平 = 不是残尾（完整的一般 JSON 正文必须原样保留）
  if (readBalanced(text, last) > 0) return text
  return text.slice(0, last).trimEnd()
}

/** 去掉协议块后剩下的正文（界面、复制、历史共用这一份） */
export function stripProtocolBlocks(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return ''
  const blocks = collectJsonBlocks(text)
  let out = ''
  let cursor = 0
  for (const b of blocks) {
    if (b.end <= cursor) continue
    const protocol =
      (b.value !== undefined && isProtocolPayload(b.value)) ||
      // 解析失败但内容明显是协议：通常是回答被截断，残块同样不该上屏
      (b.fenced && looksProtocolRaw(b.raw))
    if (!protocol) continue
    out += text.slice(cursor, b.start)
    cursor = b.end
  }
  out += text.slice(cursor)

  // 围栏开了没关（截断 / 仍在生成）：从这里到末尾都是代码残片
  const open = openFenceStart(out)
  if (open >= 0) out = out.slice(0, open)
  out = trimDanglingJson(out)

  return out.replace(/\n{3,}/g, '\n\n').trim()
}
