/**
 * Agent Loop（Step 4-2 · C5 / Step 4-3 · 二）—— **依赖全部注入**，因此多步 / 上限 /
 * 中止 / 工具异常 / **确认门 / 续跑** 都能确定化跑出来。这组用例钉住规格 §C5 的六条硬约束，
 * 外加 Step 4-3 新增的两条：
 *  · `requires-confirmation` 的工具**不被执行**，而是返回 proposal + resume；
 *  · 确认后带 `seed` 续跑时，回答**只含续跑之后产生的正文**（否则面板会重复显示一遍）。
 */
import { describe, expect, it } from 'vitest'
import { MAX_ITERATIONS, resumeWithResult, runAgent, type AgentRunDeps } from '../services/agent/loop'
import { defineTool, type AgentTool } from '../services/agent/tools'

/** 取回某次模型输入的助手（按调用次序入栈） */
function recorder() {
  const calls: string[] = []
  return { calls, push: (s: string) => calls.push(s) }
}

const searchTool = defineTool({
  id: 'tasks.search',
  name: '查待办',
  description: 'x',
  inputSchema: { query: 'x' },
  mode: 'read',
  riskLevel: 'search',
  execute: async () => ({ text: '1 条：买牛奶（今天）', count: 1 }),
})

const createTool = defineTool({
  id: 'notes.create',
  name: '记笔记',
  description: 'x',
  inputSchema: { title: 'x' },
  mode: 'safe-write',
  riskLevel: 'create',
  execute: async () => ({ text: '已记下', count: 1 }),
})

/** 需要确认的工具（`memory.save` 的形状） */
function confirmTool(executed: { value: boolean }): AgentTool {
  return defineTool({
    id: 'memory.save',
    name: '记住这件事',
    description: 'x',
    inputSchema: { text: 'x' },
    mode: 'requires-confirmation',
    riskLevel: 'sensitive',
    confirmSummary: (args) => String(args.text ?? ''),
    execute: async () => {
      executed.value = true
      return { text: '已记住：「不吃香菜」。', count: 1 }
    },
  })
}

const tools: AgentTool[] = [searchTool, createTool]

const deps = (over: Partial<AgentRunDeps> = {}): AgentRunDeps => ({
  question: '我今天有什么待办？',
  tools,
  complete: async () => '（这是最终回答）',
  ...over,
})

describe('多轮工具调用与结果回传（C5 核心）', () => {
  it('第一轮带工具 → 第二轮收到结果后给出回答', async () => {
    const r = recorder()
    const m = {
      complete: async (input: string) => {
        r.push(input)
        if (r.calls.length === 1) {
          return '我先查一下。\n```json\n{"tool":"tasks.search","args":{"query":"买"}}\n```'
        }
        return '你有一件待办：买牛奶（今天截止）。'
      },
    }
    const out = await runAgent(deps({ complete: m.complete }))
    expect(out.reason).toBe('done')
    expect(out.steps).toBe(2)
    // 第二轮输入里必须包含工具结果（回传）
    expect(r.calls[1]).toContain('买牛奶')
    // 围栏已被剥掉（用户看到的不是 JSON）
    expect(out.answer).not.toContain('```json')
  })

  it('只调一次、信息够了就直接回答（不强求多次调用）', async () => {
    const out = await runAgent(deps({ complete: async () => '不用查了，我知道：今天没有待办。' }))
    expect(out.reason).toBe('done')
    expect(out.steps).toBe(1)
    expect(out.answer).toContain('没有待办')
  })

  it('**低风险写入直接执行**（safe-write）：不必等用户点确认', async () => {
    const r = recorder()
    const m = {
      complete: async (input: string) => {
        r.push(input)
        if (r.calls.length === 1) return '记一下。\n```json\n{"tool":"notes.create","args":{"title":"买牛奶"}}\n```'
        return '已经记好了。'
      },
    }
    const out = await runAgent(deps({ tools: [createTool], complete: m.complete }))
    expect(out.reason).toBe('done')
    // 工具真的被执行了，结果回到第二轮输入里
    expect(r.calls[1]).toContain('已记下')
    expect(out.trace).toEqual([{ toolId: 'notes.create', toolName: '记笔记', ok: true, summary: '已记下' }])
  })

  it('人设块与数据上下文**分两段**进输入（人设不会被当成"用户的真实数据"）', async () => {
    const r = recorder()
    const m = {
      complete: async (input: string) => {
        r.push(input)
        return '好。'
      },
    }
    await runAgent(
      deps({
        complete: m.complete,
        personaBlock: '【人设 · DSH 鲸鱼娘】\n自称：本鲸',
        dataContext: '今天日期：2026-09-28',
      }),
    )
    const input = r.calls[0]
    expect(input.indexOf('【人设 · DSH 鲸鱼娘】')).toBeLessThan(input.indexOf('以下是知白台用户今日的真实数据'))
  })
})

describe('确认门（Step 4-3 · requires-confirmation）', () => {
  it('碰到需确认的工具 → **不执行**，返回 proposal 与 resume', async () => {
    const executed = { value: false }
    const t = confirmTool(executed)
    const events: string[] = []
    const m = {
      complete: async () => '我建议记住这件事。\n```json\n{"tool":"memory.save","args":{"text":"不吃香菜"}}\n```',
    }
    const out = await runAgent(deps({ tools: [t], complete: m.complete, onEvent: (e) => events.push(e.type) }))

    expect(out.reason).toBe('needs-confirmation')
    expect(executed.value).toBe(false) // 关键：没有偷偷写
    expect(out.proposal).toEqual({ toolId: 'memory.save', toolName: '记住这件事', args: { text: '不吃香菜' } })
    expect(out.resume?.prose).toEqual(['我建议记住这件事。'])
    expect(events).toContain('confirm-required')
    expect(events).not.toContain('tool-done')
  })

  it('确认后带 seed 续跑：回答**只含续跑之后**产生的正文（不重复上一段）', async () => {
    const executed = { value: false }
    const t = confirmTool(executed)
    const r = recorder()
    const m = {
      complete: async (input: string) => {
        r.push(input)
        if (r.calls.length === 1) return '我建议记住。\n```json\n{"tool":"memory.save","args":{"text":"不吃香菜"}}\n```'
        return '已经记好了。'
      },
    }
    const first = await runAgent(deps({ tools: [t], complete: m.complete }))
    expect(first.reason).toBe('needs-confirmation')

    // —— 面板做的事：执行工具 → 把结果并进 resume → 带 seed 续跑
    const result = await t.execute(first.proposal!.args)
    const seed = resumeWithResult(first.resume!, 'memory.save', result)
    const second = await runAgent(deps({ tools: [t], complete: m.complete, seed }))

    expect(executed.value).toBe(true)
    expect(second.reason).toBe('done')
    expect(second.answer).toBe('已经记好了。') // 不含"我建议记住。"
    // 续跑的第一轮输入里能看到工具结果（Agent 真的拿到了执行反馈）
    // 第 0 次是第一轮的推演；第 1 次就是续跑后那一轮
    expect(r.calls[1]).toContain('已记住')
  })

  it('取消（不续跑）不影响任何状态：proposal 只是被面板丢弃', async () => {
    const executed = { value: false }
    const t = confirmTool(executed)
    const out = await runAgent(
      deps({
        tools: [t],
        complete: async () => '```json\n{"tool":"memory.save","args":{"text":"x"}}\n```',
      }),
    )
    expect(out.reason).toBe('needs-confirmation')
    expect(executed.value).toBe(false)
  })
})

describe('硬上限（绝不无限循环）', () => {
  it('每次都调工具 → 撞上限退出，并如实说明', async () => {
    const m = {
      complete: async () => '```json\n{"tool":"tasks.search","args":{}}\n```',
    }
    const out = await runAgent(deps({ complete: m.complete, maxIterations: 5 }))
    expect(out.reason).toBe('max-iterations')
    expect(out.steps).toBe(5)
    expect(out.note).toContain('5 次')
  })

  it('默认上限存在（MAX_ITERATIONS = 8）', () => {
    expect(MAX_ITERATIONS).toBe(8)
  })
})

describe('中止（用户点「停止」）', () => {
  it('signal 已中止 → 立即返回 aborted，不再调用模型', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    let called = 0
    const out = await runAgent(
      deps({
        signal: ctrl.signal,
        complete: async () => {
          called++
          return '不该走到这里'
        },
      }),
    )
    expect(out.reason).toBe('aborted')
    expect(called).toBe(0)
  })

  it('模型调用中途被中止 → 返回 aborted 而不是 error', async () => {
    const ctrl = new AbortController()
    const m = {
      // 真实 fetch 在 abort 时会 reject：这里如实模拟（而不是在监听器里抛未捕获异常）
      complete: (_: string, __: (d: string) => void, signal?: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          // 半路中止：模拟用户在等待时点了「停止」
          setTimeout(() => ctrl.abort(), 0)
        }),
    }
    const out = await runAgent(deps({ signal: ctrl.signal, complete: m.complete }))
    expect(out.reason).toBe('aborted')
  })
})

describe('工具异常与未知工具', () => {
  it('工具执行失败 → 结果如实回喂，循环继续，最终仍能作答', async () => {
    const r = recorder()
    const failing = defineTool({
      id: 'tasks.search',
      name: '查待办',
      description: 'x',
      inputSchema: {},
      mode: 'read',
      riskLevel: 'search',
      execute: async () => {
        throw new Error('仓库读不出来')
      },
    })
    const m = {
      complete: async (input: string) => {
        r.push(input)
        if (r.calls.length === 1) return '我查一下。\n```json\n{"tool":"tasks.search","args":{}}\n```'
        return '这次没能查到，可能是数据没准备好。'
      },
    }
    const out = await runAgent(deps({ tools: [failing], complete: m.complete }))
    expect(out.reason).toBe('done')
    // 失败信息已回喂，模型据此改口（而不是假装成功）
    expect(r.calls[1]).toContain('读不出来')
    expect(out.trace[0]).toMatchObject({ toolId: 'tasks.search', ok: false, summary: '仓库读不出来' })
  })

  it('模型写了未知工具 → 回喂"工具不存在"，不执行、不猜', async () => {
    const r = recorder()
    let executed = false
    const spy = defineTool({
      id: 'tasks.search',
      name: '查待办',
      description: 'x',
      inputSchema: {},
      mode: 'read',
      riskLevel: 'search',
      execute: async () => {
        executed = true
        return { text: '不该执行' }
      },
    })
    const m = {
      complete: async (input: string) => {
        r.push(input)
        if (r.calls.length === 1) return '查吧。\n```json\n{"tool":"delete_all","args":{}}\n```'
        return '抱歉，我做不到那个。'
      },
    }
    const out = await runAgent(deps({ tools: [spy], complete: m.complete }))
    expect(executed).toBe(false)
    expect(out.reason).toBe('done')
    expect(r.calls[1]).toContain('工具不存在')
  })
})

describe('事件与结束原因', () => {
  it('每个阶段都广播事件（thinking / tool / tool-done / answer）', async () => {
    const events: string[] = []
    const m = {
      complete: async (input: string) =>
        !input.includes('已记下')
          ? '记吧。\n```json\n{"tool":"notes.create","args":{"title":"买牛奶"}}\n```'
          : '已记好。',
    }
    await runAgent(deps({ complete: m.complete, onEvent: (e) => events.push(e.type) }))
    expect(events).toContain('thinking')
    expect(events).toContain('tool')
    expect(events).toContain('tool-done')
    expect(events).toContain('answer')
  })

  it('模型调用整体失败 → 返回 error 并带原因', async () => {
    const out = await runAgent(
      deps({
        complete: async () => {
          throw new Error('HTTP 401：Key 无效')
        },
      }),
    )
    expect(out.reason).toBe('error')
    expect(out.errorMessage).toContain('401')
  })
})
