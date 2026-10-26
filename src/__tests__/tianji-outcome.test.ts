/**
 * 一次运行的结算 —— 首发与续跑共用同一个函数，行为不允许分叉
 *
 * 这组用例锁的是用户**看得见**的四件事：
 *  · 气泡里不能再露协议块；
 *  · 动作照旧被解析出来（清洗与解析读同一份原文）；
 *  · 中止保留已流出的正文，且不播完成音；
 *  · 失败给一句人话，而不是 HTTP 原文。
 */
import { describe, expect, it } from 'vitest'
import { settleTurn, withNote } from '../components/ai/tianji-outcome'
import type { AgentRunResult, AgentResume } from '../services/agent/loop'

const resume: AgentResume = { prose: [], feedback: [] }

function result(over: Partial<AgentRunResult>): AgentRunResult {
  return { answer: '', steps: 1, reason: 'done', trace: [], ...over }
}

describe('settleTurn · 正常回答', () => {
  it('文字留下、无动作、无提案，播完成音', () => {
    const out = settleTurn(result({ answer: '今天有三节课。' }))
    expect(out.text).toBe('今天有三节课。')
    expect(out.actions).toEqual([])
    expect(out.proposal).toBeNull()
    expect(out.phase).toBe('success')
    expect(out.chime).toBe(true)
  })

  it('动作块从正文剥掉，动作仍被解析出来（同一份原文）', () => {
    const raw =
      '记这一笔。\n```json\n{"action":"create_finance","kind":"expense","amount":25,"category":"午饭"}\n```'
    const out = settleTurn(result({ answer: raw }))
    expect(out.text).toBe('记这一笔。')
    expect(out.actions.map((a) => a.action)).toEqual(['create_finance'])
    // 有动作 = 还要等主人点确认，不能算"完成"
    expect(out.phase).toBe('waiting')
  })

  it('截断必须写进附注，且与会话本身的结束说明并存', () => {
    const out = settleTurn(result({ answer: '说到一半', note: '达到工具调用上限' }), { truncated: true })
    expect(out.note).toContain('达到工具调用上限')
    expect(out.note).toContain('截断')
  })
})

describe('settleTurn · 确认门', () => {
  it('提案带工具自己给的说明，phase=waiting', () => {
    const out = settleTurn(
      result({
        answer: '我想记住这件事。',
        reason: 'needs-confirmation',
        proposal: { toolId: 'memory.save', toolName: '记住', args: { text: '不吃香菜' } },
        resume,
      }),
    )
    expect(out.text).toBe('我想记住这件事。')
    expect(out.proposal?.summary).toBe('不吃香菜')
    expect(out.phase).toBe('waiting')
    expect(out.chime).toBe(true)
  })

  it('提案前没有正文时给一句实底，不留空气泡', () => {
    const out = settleTurn(
      result({
        answer: '',
        reason: 'needs-confirmation',
        proposal: { toolId: 'memory.save', toolName: '记住', args: { text: '甲' } },
        resume,
      }),
    )
    expect(out.text).toContain('要你点头')
  })
})

describe('settleTurn · 中止与失败', () => {
  it('中止保留已流出的正文，不播完成音，不报错误', () => {
    const out = settleTurn(result({ answer: '已完成的那段', reason: 'aborted' }), {
      partial: '已完成的那段，还有半截',
    })
    expect(out.text).toBe('已完成的那段，还有半截')
    expect(out.note).toBe('已中止')
    expect(out.phase).toBe('idle')
    expect(out.chime).toBe(false)
  })

  it('中止且一个字都没留下：如实说没有内容', () => {
    const out = settleTurn(result({ reason: 'aborted' }))
    expect(out.text).toBe('')
    expect(out.note).toBe('已中止，没有生成内容')
  })

  it('失败译成可操作的人话（HTTP 401 → 检查 Key）', () => {
    const out = settleTurn(
      result({
        reason: 'error',
        errorMessage: 'AI 请求失败 HTTP 401：{"error":{"message":"invalid key"}}',
      }),
    )
    expect(out.phase).toBe('error')
    expect(out.chime).toBe(false)
    expect(out.note).toContain('Key 无效')
    expect(out.note).not.toContain('<')
  })
})

describe('withNote', () => {
  it('正文与附注之间留一个空行；只有附注时不产生前导空行', () => {
    expect(withNote('正文', '备注')).toBe('正文\n\n（备注）')
    expect(withNote('', '备注')).toBe('（备注）')
    expect(withNote('正文')).toBe('正文')
  })
})
