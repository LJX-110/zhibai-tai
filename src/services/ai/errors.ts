/**
 * AI 故障 → 人话 / 留痕
 *
 * ## 为什么单独成文件
 * 同一类失败在三个地方露头：设置页的「测试连接」、天机面板的进度行、头部徽标的 title。
 * 此前每处各写一半（设置页有翻译、对话链路直接把 `HTTP 500：<html>…` 拼进回答），
 * 于是同一次故障在不同位置读起来像两件事。
 *
 * 这里只做两件事：
 *  · `describeAiFailure` —— 把任意 thrown 值翻成**一句可操作的中文**；
 *  · `recordAiFailure` —— 把原始错误（脱敏后）写进故障流水，别让用户看到 HTML/JSON 原文。
 *
 * ⚠️ 原始 message 仍然保留给 `health.reason` 与分支判断（provider 需要状态码），
 *    **展示层**才走这里翻译。两处用途不同，不要合并。
 */
import { recordError } from '../error-log'

/** 错误体里能拿到的短说明（JSON 的 error.message > message > error；HTML 去掉标签） */
function pickMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const nested = v.error
  if (typeof nested === 'string' && nested.trim()) return nested
  if (nested && typeof nested === 'object') {
    const inner = (nested as Record<string, unknown>).message
    if (typeof inner === 'string' && inner.trim()) return inner
  }
  if (typeof v.message === 'string' && v.message.trim()) return v.message
  return undefined
}

function stripTags(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 把服务端错误体压成一句可读的短说明。
 * 网关常见的 HTML 错误页、OpenAI 兼容接口的 `{"error":{"message":…}}` 都要能处理。
 */
export function sanitizeErrorBody(body: string): string {
  const text = body.trim()
  if (!text) return ''
  try {
    const parsed = JSON.parse(text) as unknown
    const message = pickMessage(parsed)
    if (message) return clip(stripTags(message))
  } catch {
    /* 不是 JSON：按文本处理 */
  }
  return clip(stripTags(text))
}

/** HTTP 状态码 → 用户下一步该做什么 */
function byStatus(status: number): string {
  if (status === 401 || status === 403) return `Key 无效或无权限（HTTP ${status}）—— 检查 Key 是否填错、是否已过期`
  if (status === 402) return '账户额度不足（HTTP 402）—— 去服务商控制台充值或换免费端点'
  if (status === 404) return '接口地址或模型名不存在（HTTP 404）—— 检查 Base URL 是否以 /v1 结尾、模型名是否正确'
  if (status === 429) return '触发限流（HTTP 429）—— 稍后重试，或换用免费端点的其他模型'
  if (status >= 500) return `服务端异常（HTTP ${status}）—— 多为服务商临时故障，稍后重试`
  return `请求被拒绝（HTTP ${status}）`
}

/**
 * 任意 thrown 值 → 一句人话。
 * 浏览器无法区分「跨域被拦」与「断网」（都表现为 TypeError: Failed to fetch），
 * 所以文案把两种可能都写出来，不假装知道是哪一种。
 */
export function describeAiFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const status = Number(raw.match(/HTTP (\d{3})/)?.[1] ?? NaN)

  if (!Number.isNaN(status) && status > 0) return byStatus(status)
  if (raw.includes('未配置 API Key')) return '尚未保存 API Key —— 在「系统 · AI · 模型与连接」里填好并加密保存'
  if (raw.includes('AI 响应为空')) return '模型没有返回内容 —— 可能被网关拦截，也可能流式中断，可再问一次'
  if (raw.includes('AI 未返回内容')) return '模型没有返回内容 —— 可能被网关拦截，也可能流式中断，可再问一次'
  if (err instanceof Error && err.name === 'AbortError') {
    return '请求超时 —— 检查网络，或换一个允许浏览器直连的服务'
  }
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(raw)) {
    return '连不上：大概率是跨域被拦，或只是网络不通 —— 浏览器区分不了这两种；先确认网络，再换用 DeepSeek / Kimi 这类支持浏览器直连的服务'
  }
  if (/timeout|timed out|超时/i.test(raw)) return '请求超时 —— 检查网络后重试'
  return clip(`模型调用失败：${stripTags(raw)}`)
}

/** 写一条故障流水（原始错误进 detail，展示层永远读 `describeAiFailure`） */
export function recordAiFailure(where: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err)
  recordError({
    kind: 'error',
    where,
    message: describeAiFailure(err),
    detail: raw,
  })
}
