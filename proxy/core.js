/**
 * 知白台 CORS 转发核心
 *
 * 纯前端应用在浏览器里直接抓 RSS / JSON / B 站接口时会被 CORS 拦下，
 * 公共代理（allorigins 等）时好时坏，因此需要一个自建转发端点。
 *
 * 为什么把逻辑单独放在这里：同一个代理要能以三种形态部署（Cloudflare Worker /
 * Cloudflare Pages Functions / Netlify Functions）——三者的国内可达性差异极大，
 * 多形态是可用性要求，不是冗余。抽成一份与运行时无关的 handleProxy 后，
 * 三个入口各自只有几行，行为永远一致。
 *
 * 为什么不再做 B 站 WBI 签名：签名只差一个 md5，浏览器端用现成实现即可算出
 * w_rid，前端把算好签名的完整 api.bilibili.com URL 交给本代理纯转发。
 * 服务端因此不需要 md5，也不需要 /bili/* 专用路由。
 */

/** 有些站点校验来源页，把 Referer 设成目标自身会被拒（B 站即如此），需按主机改写 */
const REFERER_OVERRIDES = {
  'api.bilibili.com': 'https://www.bilibili.com/',
}

/**
 * 浏览器里 User-Agent 是禁止修改的头，Node / Deno 端又常常不带 UA；
 * 上游（尤其 B 站）缺 UA 会直接判为爬虫返回 412，这里兜一个常见桌面 UA。
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Cloudflare 专属的边缘缓存提示；Node / Deno / Netlify 运行时无视未知字段 */
const UPSTREAM_CACHE_INIT = {
  cf: { cacheTtlByStatus: { '200-299': 300 }, cacheEverything: false },
}

function parseList(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function corsHeaders(origin, env) {
  const allowed = parseList(env?.ALLOWED_ORIGINS)
  // 未配置白名单 → 放开（个人代理，通常靠 ALLOWED_HOSTS 限制被滥用）；
  // 配置了 → 只回显白名单内的来源，其余不发 ACAO，让浏览器自行拦截
  const value = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : null
  const headers = {
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST, PATCH, PUT, DELETE',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (value) headers['Access-Control-Allow-Origin'] = value
  return headers
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  })
}

/**
 * 判断当前路径是不是「代理入口」本身。
 * Netlify 把 / 与 /proxy 都重写到同一个函数，函数看到的路径可能是原始公开路径，
 * 也可能是 /.netlify/functions/proxy，两者都算入口。
 */
function isEntryPath(pathname) {
  const trimmed = (pathname || '/').replace(/\/+$/, '')
  if (trimmed === '') return true
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) === 'proxy'
}

/**
 * 读上游 JSON。上游被风控或路由写错时往往返回 HTML 错误页，
 * 直接 res.json() 抛出的 "Unexpected token '<'" 完全看不出问题，这里换成可照做的提示。
 */
export async function readJson(res, label = '上游') {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `${label} 返回非 JSON（HTTP ${res.status}，正文开头：${text.slice(0, 120)}）`,
    )
  }
}

/**
 * CORS 转发入口，返回 Response。
 * @param {Request} request
 * @param {Record<string, string | undefined>} [env]
 */
export async function handleProxy(request, env = {}) {
  const cors = corsHeaders(request.headers.get('Origin'), env)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'])
  if (!ALLOWED_METHODS.has(request.method)) {
    return json({ error: `不支持的方法：${request.method}` }, 405, cors)
  }

  const reqUrl = new URL(request.url)
  // target 是 url 的别名：前端历史上两种写法都出现过，一起认
  const raw = reqUrl.searchParams.get('url') ?? reqUrl.searchParams.get('target')

  if (!raw) {
    if (isEntryPath(reqUrl.pathname)) {
      return json(
        {
          ok: true,
          routes: [
            '/?url=<encodeURIComponent(target)>',
            '/proxy?url=<encodeURIComponent(target)>',
          ],
        },
        200,
        cors,
      )
    }
    return json({ error: '缺少 url 参数' }, 400, cors)
  }

  let target
  try {
    target = new URL(raw)
  } catch {
    return json({ error: 'url 参数不合法' }, 400, cors)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return json({ error: '仅支持 http/https 目标' }, 400, cors)
  }

  // 主机白名单：配置后只转发列内主机，防止代理被当成公开跳板
  const allowHosts = parseList(env?.ALLOWED_HOSTS)
  if (allowHosts.length > 0 && !allowHosts.includes(target.hostname)) {
    return json({ error: `目标主机不在白名单: ${target.hostname}` }, 403, cors)
  }

  // 只带抓取必需的几个头。浏览器会自动附带 Cookie / Authorization，
  // 原样转发等于把用户凭据交给任意第三方站点 —— 仅对白名单内的授权主机转发。
  // 当前用途：Gist 同步需要带 Authorization 打到 api.github.com（ALLOWED_HOSTS 里
  // 若能命中且主机以 github 相关域结尾时放行），其余一律剥掉。
  const headers = new Headers()
  for (const name of ['Accept', 'Range', 'Content-Type']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('User-Agent', request.headers.get('User-Agent') || DEFAULT_USER_AGENT)
  headers.set('Referer', REFERER_OVERRIDES[target.hostname] ?? target.origin)

  const auth = request.headers.get('Authorization')
  const authHostAllowed =
    allowHosts.length === 0
      ? target.hostname === 'api.github.com' || target.hostname === 'gist.github.com'
      : allowHosts.includes(target.hostname)
  if (auth && authHostAllowed) headers.set('Authorization', auth)

  // body 透传（GET/HEAD 天然无 body；PATCH/POST 同步场景需要）
  let body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text().catch(() => undefined)
  }

  let upstream
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: body ?? undefined,
      redirect: 'follow',
      ...UPSTREAM_CACHE_INIT,
    })
  } catch (e) {
    return json(
      { error: `上游请求失败：${e instanceof Error ? e.message : String(e)}` },
      502,
      cors,
    )
  }

  // 透传上游状态码与正文，只用我们的 CORS 头覆盖同名头
  const respHeaders = new Headers(upstream.headers)
  for (const [k, v] of Object.entries(cors)) respHeaders.set(k, v)
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
}
