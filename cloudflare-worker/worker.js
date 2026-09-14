/**
 * Cloudflare Worker 入口（薄壳）
 *
 * 转发逻辑与 Pages / Netlify 形态共用 `../proxy/core.js`，这里只做转发。
 *
 * 注意：本形态对外域是 `*.workers.dev`，该域在国内 DNS 被污染、直连不通，
 * 首选部署形态见同目录 README.md 的 Netlify 方案。
 */
import { handleProxy } from '../proxy/core.js'

export default {
  fetch(request, env) {
    return handleProxy(request, env)
  },
}
