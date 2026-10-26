/**
 * 协议块扫描与剥离 —— 天机"对话里露代码"的根因回归
 *
 * 这里锁的是**容错面**：模型不会永远写标准的小写 ```json 围栏。
 * 曾经只认一种写法，于是大写 / 无语言 / 数组 / 裸 JSON / 未闭合围栏全部漏到气泡里。
 */
import { describe, expect, it } from 'vitest'
import {
  collectJsonBlocks,
  isProtocolPayload,
  stripProtocolBlocks,
} from '../services/agent/protocol-text'

const action = '{"action":"demo","title":"甲"}'
const tool = '{"tool":"tasks.search","args":{"query":"报销"}}'

describe('协议块识别', () => {
  it('对象里有 tool 或 action 才算协议', () => {
    expect(isProtocolPayload({ tool: 'x' })).toBe(true)
    expect(isProtocolPayload({ action: 'x' })).toBe(true)
    expect(isProtocolPayload([{ action: 'x' }])).toBe(true)
    expect(isProtocolPayload({ title: '普通数据' })).toBe(false)
    expect(isProtocolPayload([1, 2, 3])).toBe(false)
    expect(isProtocolPayload('text')).toBe(false)
  })
})

describe('剥离：各种围栏写法', () => {
  it('小写 json 围栏', () => {
    expect(stripProtocolBlocks(`我先查一下。\n\`\`\`json\n${tool}\n\`\`\``)).toBe('我先查一下。')
  })

  it('大写 JSON / 无语言 / 带空格的语言标签', () => {
    expect(stripProtocolBlocks(`好的。\n\`\`\`JSON\n${action}\n\`\`\``)).toBe('好的。')
    expect(stripProtocolBlocks(`好的。\n\`\`\`\n${action}\n\`\`\``)).toBe('好的。')
    expect(stripProtocolBlocks(`好的。\n\`\`\` javascript\nconst a = 1\n\`\`\``)).toContain('const a = 1')
  })

  it('数组里的动作也剥掉', () => {
    const arr = `[{"action":"demo","title":"甲"},{"action":"demo","title":"乙"}]`
    expect(stripProtocolBlocks(`记两条：\n\`\`\`json\n${arr}\n\`\`\``)).toBe('记两条：')
  })
})

describe('剥离：裸 JSON 与截断', () => {
  it('忘写围栏的协议 JSON 也要剥掉', () => {
    expect(stripProtocolBlocks(`我帮你记上。\n${action}`)).toBe('我帮你记上。')
    // 同一行紧跟正文
    expect(stripProtocolBlocks(`我帮你记上。${action}`)).toBe('我帮你记上。')
  })

  it('流式到一半的裸 JSON 从起点裁掉', () => {
    expect(stripProtocolBlocks('我查一下。\n{"tool":"tasks.se')).toBe('我查一下。')
    expect(stripProtocolBlocks('我查一下。{"tool"')).toBe('我查一下。')
  })

  it('围栏开了没关：从开围栏裁到末尾', () => {
    expect(stripProtocolBlocks(`我查一下。\n\`\`\`json\n${tool.slice(0, 20)}`)).toBe('我查一下。')
  })

  it('被截断的协议块（JSON 不合法）也要藏起来', () => {
    expect(stripProtocolBlocks('我先看看。\n```json\n{"action":"demo","title":"甲"')).toBe('我先看看。')
  })
})

describe('剥离：不误伤', () => {
  it('普通代码围栏原样保留', () => {
    const text = '示例：\n```js\nconst a = { x: 1 }\n```'
    expect(stripProtocolBlocks(text)).toBe(text)
  })

  it('正文里的一般 JSON 原样保留', () => {
    const text = '接口返回 {"ok":true,"count":2}。'
    expect(stripProtocolBlocks(text)).toBe(text)
  })

  it('移除后不留大段空行', () => {
    expect(stripProtocolBlocks(`第一段\n\n\`\`\`json\n${tool}\n\`\`\`\n\n第二段`)).toBe('第一段\n\n第二段')
  })
})

describe('扫描器', () => {
  it('围栏内的裸 JSON 不会被重复计数', () => {
    const blocks = collectJsonBlocks(`\`\`\`json\n${action}\n\`\`\``)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].fenced).toBe(true)
    expect(isProtocolPayload(blocks[0].value)).toBe(true)
  })

  it('未闭合围栏标记为 closed:false', () => {
    const blocks = collectJsonBlocks('```json\n{"a":1}')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].closed).toBe(false)
    expect(blocks[0].value).toBeUndefined()
  })
})
