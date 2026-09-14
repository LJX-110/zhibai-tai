/**
 * 转发通道 —— 情报抓取唯一的跨域出口
 *
 * 实测结论（2026-09，本机国内网络）：
 *  · 公共 CORS 代理已**全部不可用** —— allorigins / r.jina.ai / codetabs / thingproxy
 *    全部超时，cors.lol / cors.eu.org 一律 429；
 *  · 上表说明旧的三级兜底链实际效果是「连续三次 8 秒超时」，
 *    用户白等 24 秒只换来一句「拉取 0 条情报」，且看不出是自己没配代理。
 *
 * 所以这里不再兜底公共代理：能直连就直连，直连不行就**快速失败**并明确告诉用户
 * 「去配自建代理」。失败得快、原因清楚，比伪装成网络抖动有用得多。
 */

/** 单次请求超时：自建代理是已知可达的通道，8 秒足够；直连给宽一点 */
const SELF_TIMEOUT_MS = 8_000
const DIRECT_TIMEOUT_MS = 12_000

export interface ProxyCandidate {
  /** 用于错误提示的通道名 */
  label: string
  build: (target: string) => string
  timeoutMs: number
  /** 是否为「用户自建的代理」（决定失败时的提示文案） */
  self: boolean
}

/**
 * 自建代理的两种地址形态，三种部署形态都接受：
 *  · `<base>/?url=…`      —— Cloudflare Worker 原始形态、Netlify 根路径重定向
 *  · `<base>/proxy?url=…` —— Netlify / Cloudflare Pages Functions 的显式路径
 * 先试根路径（覆盖多数情况），失败再试 /proxy，避免让用户去记该填哪种。
 */
export function proxyCandidates(selfProxyUrl?: string): ProxyCandidate[] {
  const base = selfProxyUrl?.trim().replace(/\/+$/, '')
  if (!base) {
    return [{ label: '直连', build: (t) => t, timeoutMs: DIRECT_TIMEOUT_MS, self: false }]
  }
  const candidates: ProxyCandidate[] = [
    { label: '自建代理', build: (t) => `${base}/?url=${encodeURIComponent(t)}`, timeoutMs: SELF_TIMEOUT_MS, self: true },
    { label: '自建代理 /proxy', build: (t) => `${base}/proxy?url=${encodeURIComponent(t)}`, timeoutMs: SELF_TIMEOUT_MS, self: true },
  ]
  return candidates
}

/** 未配置代理时的统一提示：要能直接照着做 */
export const NEEDS_PROXY_MESSAGE =
  '跨域抓取需要自建代理（公共代理在国内已全部不可用）。部署见仓库 proxy/ 或 cloudflare-worker/README.md，约 2 分钟'

/** 目标自带 CORS 头时无需代理 —— 命中这些主机就直接连，省一次转发 */
const DIRECT_HOSTS = [
  'api.github.com',
  'api.jikan.moe',
  'sspai.com',
  'www.sspai.com',
]

function isDirectFriendly(target: string): boolean {
  try {
    return DIRECT_HOSTS.includes(new URL(target).hostname)
  } catch {
    return false
  }
}

export function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return outer ? AbortSignal.any([outer, timeout]) : timeout
}

/**
 * 按候选链拉取文本。
 * 全部通道失败时抛出**可读**的错误：区分「没配代理」与「配了但连不上」。
 */
export async function proxyFetch(
  url: string,
  selfProxyUrl?: string,
  signal?: AbortSignal,
): Promise<string> {
  const configured = proxyCandidates(selfProxyUrl)
  // 目标自带 CORS 时直连优先，避免绕一圈
  const chain = isDirectFriendly(url)
    ? configured.filter((c) => !c.self).concat(configured.filter((c) => c.self))
    : configured

  const problems: string[] = []
  for (const candidate of chain) {
    try {
      const res = await fetch(candidate.build(url), {
        signal: timeoutSignal(candidate.timeoutMs, signal),
      })
      if (res.ok) return await res.text()
      // 404/403 这类是代理本身的问题（路径不对/白名单拦截），值得记下来
      problems.push(`${candidate.label} HTTP ${res.status}`)
    } catch (e) {
      const reason =
        e instanceof Error
          ? e.name === 'TimeoutError' || e.name === 'AbortError'
            ? '超时'
            : e.message
          : '未知错误'
      problems.push(`${candidate.label} ${reason}`)
    }
  }

  const detail = problems.join('；')
  if (!selfProxyUrl?.trim()) {
    throw new Error(`${NEEDS_PROXY_MESSAGE}（${detail}）`)
  }
  throw new Error(`自建代理不可达：${detail}`)
}
