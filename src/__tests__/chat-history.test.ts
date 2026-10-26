/**
 * 会话存档 —— 旧数据 / 坏数据 / 超长存档都不能把对话链路带崩
 *
 * 真实故障形态：上一版把动作 JSON 原样存进历史，长会话把 prompt 顶爆，
 * 模型侧报 400 —— 用户看到的是"偶发报错"，实际是存档在慢性膨胀。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { formatHistory, loadHistory, saveHistory, type ChatMessage } from '../components/ai/chat-history'

const KEY = 'zbt:ai-chat:v1'

// 测试环境自带 localStorage（fake-indexeddb 同款的内存实现），
// 每个用例前清空即可 —— 不能用 stubGlobal 覆盖：它是不可重定义的访问器。
beforeEach(() => {
  localStorage.clear()
})

const ai = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `ai-${Math.random()}`,
  role: 'ai',
  content,
  ...extra,
})

describe('loadHistory · 旧存档校验', () => {
  it('损坏的 JSON 视为空会话，不抛错', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadHistory()).toEqual([])
  })

  it('丢弃坏条目，保留好条目，并给缺 id 的旧消息补稳定 id', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { role: 'system', content: '不该出现' },
        { role: 'user', content: 123 },
        { role: 'user', content: '旧消息没有 id' },
        {
          role: 'ai',
          content: '好',
          trace: [{ toolId: 'tasks.search', toolName: '查待办', ok: true, summary: '3 条' }, { bad: 1 }],
        },
      ]),
    )
    const out = loadHistory()
    expect(out).toHaveLength(2)
    expect(out[0].content).toBe('旧消息没有 id')
    expect(out[0].id).toBeTruthy()
    expect(out[1].trace).toEqual([
      { toolId: 'tasks.search', toolName: '查待办', ok: true, summary: '3 条' },
    ])
  })

  it('旧存档里残留的协议块在读入时就被清掉', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        ai('我查一下。\n```json\n{"tool":"tasks.search","args":{}}\n```'),
      ]),
    )
    expect(loadHistory()[0].content).toBe('我查一下。')
  })
})

describe('saveHistory · 清洗与预算', () => {
  it('AI 正文里的协议块不落档', () => {
    saveHistory([ai('记下了。\n```json\n{"action":"create_finance","amount":1}\n```')])
    const raw = JSON.parse(localStorage.getItem(KEY)!) as ChatMessage[]
    expect(raw[0].content).toBe('记下了。')
  })

  it('只有轨迹、没有正文的消息仍然保留（它是下一轮的事实依据）', () => {
    saveHistory([
      ai('', {
        trace: [{ toolId: 'tasks.search', toolName: '查待办', ok: true, summary: '3 条' }],
      }),
    ])
    expect(loadHistory()).toHaveLength(1)
  })

  it('条数上限 60', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({
      id: `m${i}`,
      role: 'user' as const,
      content: `第 ${i} 条`,
    }))
    saveHistory(many)
    expect(loadHistory()).toHaveLength(60)
  })

  it('字符预算：从末尾保留，最后一条无论多长都留', () => {
    const long = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      role: 'user' as const,
      content: `${i}`.padEnd(6000, 'x'),
    }))
    saveHistory(long)
    const out = loadHistory()
    // 6000 × 4 = 24000，正好到预算；再往前一条就超了
    expect(out).toHaveLength(4)
    expect(out[3].content.startsWith('5')).toBe(true)
  })
})

describe('formatHistory · 送进提示词的那一份', () => {
  it('超过 12 轮时把更早的压成一行摘要', () => {
    const messages: ChatMessage[] = Array.from({ length: 13 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? ('user' as const) : ('ai' as const),
      content: `第 ${i} 句`,
    }))
    const text = formatHistory(messages)
    expect(text.split('\n')).toHaveLength(13)
    expect(text).toContain('（更早的对话已压缩）')
  })

  it('手工构造的脏消息也不会把协议 JSON 喂回模型', () => {
    const text = formatHistory([ai('好的。\n```json\n{"action":"x"}\n```')])
    expect(text).toContain('好的。')
    expect(text).not.toContain('"action"')
  })

  it('工具轨迹并进该条回答（下一轮才知道上一轮查过什么）', () => {
    const text = formatHistory([
      ai('查到 3 条。', {
        trace: [{ toolId: 'tasks.search', toolName: '查待办', ok: true, summary: '3 条未完成' }],
      }),
    ])
    expect(text).toContain('天机：查到 3 条。')
    expect(text).toContain('本轮用了：查待办→3 条未完成')
  })
})
