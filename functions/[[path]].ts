/**
 * Cloudflare Pages Functions 入口（薄壳）
 *
 * `[[path]]` 捕获全部路径，因此 `/`、`/proxy` 以及任意 path 携带 url 参数
 * 都能落到同一处转发逻辑。
 */
import { handleProxy } from '../proxy/core.js'

interface ProxyEnv {
  ALLOWED_HOSTS?: string
  ALLOWED_ORIGINS?: string
  /** 索引签名对齐核心层对 env 的宽松约定，避免新增变量时反复改类型 */
  [key: string]: string | undefined
}

export function onRequest(context: { request: Request; env: ProxyEnv }): Promise<Response> {
  return handleProxy(context.request, context.env)
}
