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
  http: 'HTTP 错误',
  network: '网络不可达',
}

/**
 * 该类型失败重试是否有意义。
 * config / auth / parse / empty 属于「配置或数据本身不对」，重试一万次也是同样结果；
 * 把它们排除在退避与「重试」按钮的推荐之外，避免用户靠反复点击来碰运气。
 */
const RETRYABLE: ReadonlySet<FetchErrorKind> = new Set<FetchErrorKind>([
  'cors',
  'blocked',
  'rate_limit',
  'timeout',
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

export function classifyFetchError(e: unknown): FetchErrorInfo {
  const msg = e instanceof Error ? e.message : String(e)
  const m = msg.toLowerCase()
  const byName = e instanceof Error ? e.name : ''

  const byPrefix = prefixOf(msg)
  if (byPrefix === 'empty') {
    return { kind: 'empty', message: '连上了但没有数据：检查源配置里的路径/选择器是否匹配当前页面结构' }
  }
  if (byPrefix === 'parse') {
    return { kind: 'parse', message: '返回内容与所选 Provider 不匹配：确认源地址类型（RSS / JSON / HTML）与字段映射' }
  }

  // 限流必须在「自建代理」之前判：经代理转发时上游返回 429，
  // 代理链的错误消息里也带「自建代理」，若先命中 config 就会把限流误报成「没配代理」
  if (m.includes('429') || m.includes('too many requests') || m.includes('rate limit') || m.includes('限流') || m.includes('频繁')) {
    return { kind: 'rate_limit', message: '被目标站点限流：已自动退避，稍后再试或延长抓取间隔' }
  }
  // 412 / 风控 / 验证码属于「被识别为爬虫」，与 CORS 是两回事：
  // CORS 是浏览器层面的拦截，换个出口（代理）就能过；反爬是站点主动拒绝，换出口也可能照样被拒
  if (m.includes('412') || m.includes('风控') || m.includes('captcha') || m.includes('验证码') || m.includes('人机') || m.includes('access denied') || m.includes('blocked')) {
    return { kind: 'blocked', message: '目标站点判定为爬虫并拒绝（风控/验证码）：改用官方 API，或降低抓取频率' }
  }
  // 「没配代理」不是网络故障，而是可操作的一步：单独成一类，界面上要给入口而不是报错
  if (msg.includes('自建代理')) {
    return { kind: 'config', message: msg }
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('cors') || m.includes('cross-origin')) {
    return { kind: 'cors', message: '跨域被拦（CORS）或网络受限：该源不放 CORS 头，浏览器无法直连，需经自建代理转发或改用 RSS/JSON 接口' }
  }
  if (m.includes('401') || m.includes('unauthorized') || m.includes('403') || m.includes('forbidden') || m.includes('api key') || m.includes('token')) {
    return { kind: 'auth', message: '认证失败：该源需要 API Key 或登录态，检查源配置里填的凭证' }
  }
  if (byName === 'TimeoutError' || byName === 'AbortError' || m.includes('abort') || m.includes('timeout') || m.includes('超时')) {
    return { kind: 'timeout', message: '请求超时或被取消：对方响应过慢或当前网络不通，稍后重试' }
  }
  if (m.includes('json') || m.includes('xml') || m.includes('unexpected token') || m.includes('parse')) {
    return { kind: 'parse', message: '解析失败：返回的不是预期格式（很可能拿到的是错误页而非数据）' }
  }
  if (/http\s*\d{3}/.test(m) || m.startsWith('http')) {
    return { kind: 'http', message: `目标返回错误状态码：${msg}（确认地址是否仍然有效）` }
  }
  return { kind: 'network', message: msg || '网络不可达' }
}
