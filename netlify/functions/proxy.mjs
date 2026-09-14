/**
 * Netlify Functions 入口（薄壳）
 *
 * netlify.toml 把 `/` 与 `/proxy` 都重写到本函数，对外地址形如
 * https://<site>.netlify.app/proxy?url=...（Netlify 域在国内实测可达，是首选形态）。
 */
import { handleProxy } from '../../proxy/core.js'

export default function handler(request) {
  // Netlify 函数跑在 Node 上，环境变量经 process.env 注入（ALLOWED_HOSTS / ALLOWED_ORIGINS）
  return handleProxy(request, process.env)
}
