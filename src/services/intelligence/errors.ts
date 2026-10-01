/**
 * 抓取失败分类 —— 把「失败」翻译成一句可照做的下一步
 *
 * 为什么单独成模块：Provider 抛出的原始错误形态五花八门
 * （`Failed to fetch`（浏览器把 CORS、DNS、断网压成同一句）/ `AbortError` /
 * `HTTP 429` / 上游 HTML 里塞的错误页 / `Unexpected token '<'`），
 * 而用户能采取的行动只有有限的几种。分类越准，「为什么这次没抓到」越好回答；
 * 分类错了则会把用户支使到错误的方向（例如把限流说成「没配代理」，
 * 用户去配了代理仍然失败）。
 *
 * `kind` 只做归类，`message` 才是给用户看的；
 * 两者分开是因为 UI 需要按 kind 决定入口（如 config 类要给「去配代理」按钮），
 * 按 message 做字符串匹配太脆弱。
 *
 * ## Step 5-1 · C3：修掉一处真实的误判（顺序问题）
 * 上一版 `auth` 分支的判据里有 `m.includes('token')`，而它**排在 `parse` 之前**；
 * `JSON.parse` 对 HTML 错误页抛出的正是 `Unexpected token '<'…` ——
 * 那句里含 `token`，于是被归成 **「认证失败：该源需要 API Key」**，
 * 而情报源根本没有凭证可填（`IntelligenceSource` 无凭据字段）。
 * 用户于是去找一个不存在的解法。
 *
 * 现在：**结构/语法证据（parse）优先于"文本里出现了某个词"（auth）**，
 * 并把 `token` 的匹配收紧成独立单词。同时补上 `server`（5xx）与 `not_found`（404）：
 * 它们的处置方式（等一等 / 换地址）与 `auth`（配凭证）完全不同。
 */

export type FetchErrorKind =
  | 'config'
  | 'cors'
  | 'blocked'
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'parse'
  | 'empty'
  | 'not_found'
  | 'server'
  | 'http'
  | 'network'

export interface FetchErrorInfo {
  kind: FetchErrorKind
  message: string
}

/** 界面上给 kind 一个短标签；比裸的英文枚举可读，又不占宽度 */
export const KIND_LABEL: Record<FetchErrorKind, string> = {
  config: '需配代理',
  cors: '跨域被拦',
  blocked: '被反爬拦截',
  auth: '需认证',
  rate_limit: '被限流',
  timeout: '超时',
  parse: '解析失败',
  empty: '无数据',
  not_found: '地址失效',
  server: '上游故障',
  http: 'HTTP 错误',
  network: '网络不可达',
}

/**
 * 该类型失败重试是否有意义。
 * config / auth / parse / empty / not_found 属于「配置或数据本身不对」，
 * 重试一万次也是同样结果；把它们排除在退避与「重试」按钮的推荐之外，
 * 避免用户靠反复点击来碰运气。
 * `server`（5xx）**可以重试** —— 上游临时故障等一会儿往往就好了。
 */
const RETRYABLE: ReadonlySet<FetchErrorKind> = new Set<FetchErrorKind>([
  'cors',
  'blocked',
  'rate_limit',
  'timeout',
  'server',
  'http',
  'network',
])

export function isRetryable(kind: FetchErrorKind): boolean {
  return RETRYABLE.has(kind)
}

/** Provider 内部约定：错误消息以 `empty:` / `parse:` 开头即可被准确归类，无需额外通道 */
function prefixOf(msg: string): FetchErrorKind | null {
  if (msg.startsWith('empty:')) return 'empty'
  if (msg.startsWith('parse:')) return 'parse'
  return null
}

/** 解析类证据：拿到的是 HTML 错误页 / 非法 JSON / 格式不符 */
function looksLikeParseProblem(m: string): boolean {
  return (
    m.includes('unexpected token') ||
    m.includes('is not valid json') ||
    m.includes('not valid json') ||
    m.includes('json.parse') ||
    m.includes('非 json') ||
    m.includes('non-json') ||
    m.includes('没有可映射') ||
    m.includes('xml') ||
    /\bparse\b/.test(m)
  )
}

/** 反爬证据 */
function looksLikeBlocked(m: string): boolean {
  return (
    m.includes('412') ||
    m.includes('风控') ||
    m.includes('captcha') ||
    m.includes('验证码') ||
    m.includes('人机') ||
    m.includes('access denied') ||
    m.includes('blocked')
  )
}

/** 5xx 上游故障证据（含无状态码时的通用文案） */
function looksLikeServerError(m: string): boolean {
  return (
    /\b(500|501|502|503|504|507|508|509)\b/.test(m) ||
    m.includes('internal server') ||
    m.includes('bad gateway') ||
    m.includes('service unavailable') ||
    m.includes('gateway timeout') ||
    m.includes('服务端异常') ||
    m.includes('上游故障')
  )
}

export function classifyFetchError(e: unknown): FetchErrorInfo {
  const msg = e instanceof Error ? e.message : String(e)
  const m = msg.toLowerCase()
  const byName = e instanceof Error ? e.name : ''

  // ① Provider 的显式信号最可信（它们比任何文本猜测都准）
  const byPrefix = prefixOf(msg)
  if (byPrefix === 'empty') {
    return { kind: 'empty', message: '连上了但没有数据：检查源配置里的路径/选择器是否匹配当前页面结构' }
  }
  if (byPrefix === 'parse') {
    return { kind: 'parse', message: '返回内容与所选 Provider 不匹配：确认源地址类型（RSS / JSON / HTML）与字段映射' }
  }

  // ② **明确的"被拒绝"状态码优先于结构证据**。
  //    代理链会把上游状态码写进消息（如「上游 返回非 JSON（HTTP 429…）」）——
  //    此时正文不是 JSON，恰恰**因为**被限流了。先判 parse 会让用户去查"地址是否失效"，
  //    又是把方向指错。有状态码时，状态码就是答案。
  //    （同理见 ③~⑤ 的 412 / 404 / 5xx。）
  if (m.includes('429') || m.includes('too many requests') || m.includes('rate limit') || m.includes('限流') || m.includes('频繁')) {
    return { kind: 'rate_limit', message: '被目标站点限流：已自动退避，稍后再试或延长抓取间隔' }
  }

  // 412 / 风控 / 验证码属于「被识别为爬虫」，与 CORS 是两回事：
  // CORS 是浏览器层面的拦截，换个出口（代理）就能过；反爬是站点主动拒绝
  if (looksLikeBlocked(m)) {
    return { kind: 'blocked', message: '目标站点判定为爬虫并拒绝（风控/验证码）：改用官方 API，或降低抓取频率' }
  }

  // 「没配代理」不是网络故障，而是可操作的一步：单独成一类，界面上给入口而不是报错
  if (msg.includes('自建代理')) {
    return { kind: 'config', message: msg }
  }

  // 地址失效（404）——「换地址」而不是「配凭证」
  if (/\b404\b/.test(m) || m.includes('not found')) {
    return { kind: 'not_found', message: '目标地址不存在（404）：源地址可能已失效或被改名，换一个地址试试' }
  }

  // 上游 5xx —— 「等一等」而不是「配凭证」也不是「配代理」
  if (looksLikeServerError(m)) {
    return { kind: 'server', message: '目标服务端出错（5xx）：多为对方临时故障，稍后重试即可' }
  }

  // ③ **结构/语法证据**（C3 的核心修正）：拿到 HTML 错误页 → 是"格式不对"，
  //    不是"认证失败"，哪怕那句话里带 token。
  //    到这里状态码类证据已经全部排除，剩下的 parse 都是"真的解析问题"。
  if (looksLikeParseProblem(m)) {
    return {
      kind: 'parse',
      message: '解析失败：拿到的大概率是错误页而不是数据（检查地址是否失效、是否被拦）',
    }
  }

  // ④ 认证类放到后面：它只能靠"文本里出现了某个词"判断，可信度最低，
  //    要等结构证据（parse）与状态证据（404 / 5xx）都排除之后。
  //    `token` 收紧为独立单词，避免再被 `unexpected token` 这类短语命中。
  if (
    m.includes('401') ||
    m.includes('403') ||
    m.includes('unauthorized') ||
    m.includes('forbidden') ||
    m.includes('api key') ||
    /\btoken\b/.test(m)
  ) {
    return { kind: 'auth', message: '认证失败：该源需要 API Key 或登录态，检查源配置里填的凭证' }
  }

  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('cors') || m.includes('cross-origin')) {
    return { kind: 'cors', message: '跨域被拦（CORS）或网络受限：该源不放 CORS 头，浏览器无法直连，需经自建代理转发或改用 RSS/JSON 接口' }
  }

  if (byName === 'TimeoutError' || byName === 'AbortError' || m.includes('abort') || m.includes('timeout') || m.includes('超时')) {
    return { kind: 'timeout', message: '请求超时或被取消：对方响应过慢或当前网络不通，稍后重试' }
  }

  if (/http\s*\d{3}/.test(m) || m.startsWith('http')) {
    return { kind: 'http', message: `目标返回错误状态码：${msg}（确认地址是否仍然有效）` }
  }
  return { kind: 'network', message: msg || '网络不可达' }
}
