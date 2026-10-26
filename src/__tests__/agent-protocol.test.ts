/**
 * 工具协议解析 —— 模型不会永远写标准的小写 ```json 围栏
 *
 * 这里锁两件事：容错面（大写 / 无语言 / 裸 JSON）与安全边界（正文里的示例不执行）。
 */
import { describe, expect, it } from 'vitest'
import { parseToolCall, stripToolFences } from '../services/agent/protocol'
import { defineTool } from '../services/agent/tools'

const searchTool = defineTool({
  id: 'tasks.search',
  name: '查待办',
  description: 'x',
  inputSchema: { query: 'x' },
  mode: 'read',
  riskLevel: 'search',
  execute: async () => ({ text: '' }),
})
const tools = [searchTool]

const body = '{"tool":"tasks.search","args":{"query":"报销"}}'

describe('工具调用解析', () => {
  it('标准小写 json 围栏', () => {
    expect(parseToolCall(`我先查一下。\n\`\`\`json\n${body}\n\`\`\``, tools)).toEqual({
      id: 'tasks.search',
      args: { query: '报销' },
    })
  })

  it('大写 JSON / 无语言围栏也认', () => {
    expect(parseToolCall(`\`\`\`JSON\n${body}\n\`\`\``, tools)?.id).toBe('tasks.search')
    expect(parseToolCall(`\`\`\`\n${body}\n\`\`\``, tools)?.id).toBe('tasks.search')
  })

  it('忘写围栏、但放在回答末尾的裸 JSON 也认', () => {
    expect(parseToolCall(`我先查一下。\n${body}`, tools)?.id).toBe('tasks.search')
  })

  it('正文中间引用的裸 JSON **不执行**（那只是举例）', () => {
    expect(parseToolCall(`格式是这样：${body}，你照着写。`, tools)).toBeNull()
  })

  it('多个块取最后一个（模型常在解释里举例）', () => {
    const first = '{"tool":"tasks.search","args":{"query":"旧的"}}'
    const last = '{"tool":"tasks.search","args":{"query":"新的"}}'
    expect(parseToolCall(`\`\`\`json\n${first}\n\`\`\`\n说明\n\`\`\`json\n${last}\n\`\`\``, tools)?.args).toEqual({
      query: '新的',
    })
  })

  it('未申报的工具不执行，但如实回喂"不存在"', () => {
    expect(parseToolCall('```json\n{"tool":"nope.run","args":{}}\n```', tools)).toEqual({
      id: '__unknown__:nope.run',
      args: {},
    })
  })
})

describe('工具围栏剥离', () => {
  it('工具块与动作块都剥掉，正文保留', () => {
    const text = `先查一下。\n\`\`\`json\n${body}\n\`\`\`\n再记一条。\n\`\`\`json\n{"action":"demo","title":"甲"}\n\`\`\``
    expect(stripToolFences(text)).toBe('先查一下。\n\n再记一条。')
  })

  it('普通代码样例原样保留', () => {
    const text = '示例：\n```js\nconst a = 1\n```'
    expect(stripToolFences(text)).toBe(text)
  })
})
