/**
 * 知白台 CORS 代理 Worker
 *
 * 契约：GET https://<worker>/?url=<encodeURIComponent(target)>
 * 返回上游响应体，并附加 CORS 头，供纯前端应用跨域拉取 RSS / JSON。
 *
 * 部署：见同目录 README.md（3 步，免费额度足够个人使用）。
 * 安全：仅放行 GET/HEAD；可选 ALLOWED_HOSTS 主机白名单、
 *       ALLOWED_ORIGINS 来源白名单（见 wrangler.toml 注释）。
 */

function parseList(v) {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

function corsHeaders(origin, env) {
  const allowed = parseList(env.ALLOWED_ORIGINS)
  // 未配置白名单 → 放开（个人代理，配合 ALLOWED_HOSTS 使用）；
  // 配置了 → 仅回显白名单内的来源
  const value = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : null
  const headers = {
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (value) headers['Access-Control-Allow-Origin'] = value
  return headers
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin'), env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: '仅支持 GET/HEAD' }, 405, cors)
    }

    const target = new URL(request.url).searchParams.get('url')
    if (!target) return json({ error: '缺少 url 参数' }, 400, cors)

    let parsed
    try {
      parsed = new URL(target)
    } catch {
      return json({ error: 'url 参数不合法' }, 400, cors)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return json({ error: '仅支持 http/https 目标' }, 400, cors)
    }

    // 主机白名单：配置后仅转发列表内主机，防止代理被滥用为公开跳板
    const allowHosts = parseList(env.ALLOWED_HOSTS)
    if (allowHosts.length > 0 && !allowHosts.includes(parsed.hostname)) {
      return json({ error: `目标主机不在白名单: ${parsed.hostname}` }, 403, cors)
    }

    // 转发时剥离浏览器自动附带的敏感头（Cookie / 本地存储标记）
    const headers = new Headers()
    for (const h of ['Accept', 'User-Agent', 'Range']) {
      const v = request.headers.get(h)
      if (v) headers.set(h, v)
    }
    headers.set('Referer', parsed.origin)

    const upstream = await fetch(parsed, {
      method: request.method,
      headers,
      redirect: 'follow',
      // cf: 缓存 5 分钟，同源重复抓取省额度（RSS 场景足够新鲜）
      cf: { cacheTtlByStatus: { '200-299': 300 }, cacheEverything: false },
    })

    const respHeaders = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(cors)) respHeaders.set(k, v)
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
  },
}
