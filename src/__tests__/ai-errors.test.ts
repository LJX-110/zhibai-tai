/**
 * AI 故障 → 人话 / 脱敏
 *
 * 界面读的是翻译，不是服务端原文；原始错误只进故障流水。
 * 这组用例同时锁住"HTML 错误页不能整段糊到用户脸上"。
 */
import { describe, expect, it } from 'vitest'
import { describeAiFailure, sanitizeErrorBody } from '../services/ai/errors'

describe('sanitizeErrorBody', () => {
  it('OpenAI 兼容的 error.message', () => {
    expect(sanitizeErrorBody('{"error":{"message":"Rate limit exceeded"}}')).toBe('Rate limit exceeded')
  })

  it('顶层 message', () => {
    expect(sanitizeErrorBody('{"message":"bad request"}')).toBe('bad request')
  })

  it('网关 HTML 错误页只留文字', () => {
    expect(sanitizeErrorBody('<html><body><h1>502 Bad Gateway</h1></body></html>')).toBe('502 Bad Gateway')
  })

  it('非 JSON 纯文本原样（去标签后）返回', () => {
    expect(sanitizeErrorBody('upstream timeout')).toBe('upstream timeout')
  })

  it('超长说明截断，不让一屏都是错误原文', () => {
    const long = 'x'.repeat(300)
    const out = sanitizeErrorBody(long)
    expect(out.length).toBeLessThanOrEqual(121)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('describeAiFailure', () => {
  it('按状态码给出下一步', () => {
    expect(describeAiFailure(new Error('AI 请求失败 HTTP 401'))).toContain('Key 无效')
    expect(describeAiFailure(new Error('AI 请求失败 HTTP 402'))).toContain('额度不足')
    expect(describeAiFailure(new Error('AI 请求失败 HTTP 404'))).toContain('Base URL')
    expect(describeAiFailure(new Error('AI 请求失败 HTTP 429'))).toContain('限流')
    expect(describeAiFailure(new Error('AI 请求失败 HTTP 503'))).toContain('服务端异常')
  })

  it('未配置 Key 与空响应各有明确出口', () => {
    expect(describeAiFailure(new Error('未配置 API Key'))).toContain('尚未保存 API Key')
    expect(describeAiFailure(new Error('AI 响应为空'))).toContain('没有返回内容')
  })

  it('浏览器分不清跨域与断网 —— 文案不假装知道', () => {
    const out = describeAiFailure(new TypeError('Failed to fetch'))
    expect(out).toContain('跨域')
    expect(out).toContain('网络')
  })

  it('中止被译成超时', () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    expect(describeAiFailure(err)).toContain('超时')
  })

  it('未知错误兜底仍是一句人话，不整段抛原文', () => {
    const out = describeAiFailure(new Error('<b>boom</b>'))
    expect(out).toContain('模型调用失败')
    expect(out).not.toContain('<b>')
  })
})
