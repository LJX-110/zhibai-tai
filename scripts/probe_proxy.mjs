/**
 * 代理转发链路验证（不依赖部署，直接调用 handleProxy）
 * 运行：node scripts/probe_proxy.mjs
 *
 * 覆盖：入口用法路由 → 缺参/非法协议/非法方法 → 主机白名单 → 真实转发
 * api.bilibili.com（Referer 改写与 cf 缓存字段的运行时兼容性都在这一跳里一并验证）。
 * 需要外网；仅用于人工排查，不参与构建与测试。
 */
import { handleProxy, readJson } from '../proxy/core.js'

const BASE = 'https://proxy.local'
const BILI_NAV = 'https://api.bilibili.com/x/web-interface/nav'

let failed = 0

function check(label, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

function call(pathname, init, env = {}) {
  return handleProxy(new Request(BASE + pathname, init), env)
}

const q = (target) => `/?url=${encodeURIComponent(target)}`

// —— 入口本身：无 url 参数时给用法说明 ——
for (const path of ['/', '/proxy']) {
  const res = await call(path)
  const body = await readJson(res, '入口')
  check(
    `${path} 无参数返回用法说明`,
    res.status === 200 && body.ok === true && Array.isArray(body.routes),
    `HTTP ${res.status} routes=${body.routes?.length}`,
  )
}

// —— 非法请求 ——
const noUrl = await call('/unknown-path')
check('未知路径且缺 url → 400', noUrl.status === 400, `HTTP ${noUrl.status}`)

const badProto = await call(q('ftp://example.com/a'))
check('非 http/https 目标 → 400', badProto.status === 400, `HTTP ${badProto.status}`)

const badUrl = await call(q('not a url'))
check('url 不合法 → 400', badUrl.status === 400, `HTTP ${badUrl.status}`)

const post = await call(q(BILI_NAV), { method: 'POST' })
check('POST → 405', post.status === 405, `HTTP ${post.status}`)

const preflight = await call('/', { method: 'OPTIONS' })
check(
  'OPTIONS 预检 → 204 且带 ACAO',
  preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Origin') === '*',
  `HTTP ${preflight.status} ACAO=${preflight.headers.get('Access-Control-Allow-Origin')}`,
)

const blocked = await call(q(BILI_NAV), {}, { ALLOWED_HOSTS: 'example.com' })
check('主机不在白名单 → 403', blocked.status === 403, `HTTP ${blocked.status}`)

// —— readJson 对非 JSON 上游给出可读提示（离线构造，不占外网）——
try {
  await readJson(new Response('<html>风控页</html>', { status: 403 }), '示例上游')
  check('readJson 非 JSON 报错可读', false, '未抛错')
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  check(
    'readJson 非 JSON 报错可读',
    msg.includes('返回非 JSON') && !msg.includes('Unexpected token'),
    msg,
  )
}

// —— 真实转发：B 站 nav（需外网）——
console.log('\n--- 真实转发 api.bilibili.com ---')
for (const [label, path] of [
  ['/?url=…', q(BILI_NAV)],
  ['/proxy?url=…', `/proxy?url=${encodeURIComponent(BILI_NAV)}`],
]) {
  try {
    const res = await call(path)
    const acao = res.headers.get('Access-Control-Allow-Origin')
    let body
    let parsed = true
    try {
      body = await readJson(res, 'B 站 nav')
    } catch (e) {
      parsed = false
      body = { error: e instanceof Error ? e.message : String(e) }
    }
    check(
      `${label} 转发 B 站 nav`,
      res.status === 200 && parsed && typeof body.code === 'number' && acao === '*',
      `HTTP ${res.status} code=${body.code ?? body.error} ACAO=${acao}`,
    )
  } catch (e) {
    check(`${label} 转发 B 站 nav`, false, e instanceof Error ? e.message : String(e))
  }
}

// HEAD 也要能透传状态码（不带正文）。
// 用 B 站首页而非 nav：nav 接口本身不支持 HEAD（上游回 405），会干扰判断
try {
  const res = await call(q('https://www.bilibili.com/'), { method: 'HEAD' })
  check('HEAD 转发 → 200', res.status === 200, `HTTP ${res.status}`)
} catch (e) {
  check('HEAD 转发 → 200', false, e instanceof Error ? e.message : String(e))
}

console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 例`)
process.exit(failed === 0 ? 0 : 1)
