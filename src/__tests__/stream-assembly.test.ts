/**
 * 流式装配 + SSE 回放一致性
 *
 * 流式改造最怕的不是"不流式"，而是**流式与非流式给出两份内容**（丢片段、顺序错、
 * 重复），且差异只在长回答下偶发。这里用两组用例把它钉死：
 *  1. 装配器本身的累加不变式（含空 delta / received 判定）；
 *  2. **用同一段录制的 SSE 流回放**，断言 `completeStream` 的返回值 ===
 *     非流式 `complete` 的返回值 —— 即"一致性靠构造"这句话在真实解析路径上成立。
 * 另锁 `finish_reason=length`（截断）必须通过 onFinish 报出来，
 * 以及「中止不是失败」——不得把状态打成 degraded、不得降级出本地回答。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openAICompatibleProvider, localProvider, type StreamFinishInfo } from '../services/ai/provider'
import { createStreamAssembler } from '../services/ai/stream-assembly'
import { aiService } from '../services/ai/capabilities'
import { withStreamSink } from '../services/ai/stream-sink'
import { __resetAiRemoteHealthForTest, getAiRemoteHealth } from '../services/ai/health'

beforeEach(() => {
  __resetAiRemoteHealthForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  // aiService.use 是模块级状态，测完归位，避免污染其他用例
  aiService.use(localProvider)
})

describe('流式装配器', () => {
  it('增量按序累加，finish() === text()', () => {
    const asm = createStreamAssembler()
    asm.push('今天')
    asm.push('有')
    asm.push('三节课')
    expect(asm.text()).toBe('今天有三节课')
    expect(asm.finish()).toBe('今天有三节课')
  })

  it('空增量忽略，且不影响「收到过内容」的判定（SSE 心跳不应污染状态）', () => {
    const asm = createStreamAssembler()
    expect(asm.received).toBe(false)
    asm.push('')
    expect(asm.received).toBe(false)
    expect(asm.text()).toBe('')
    asm.push('x')
    asm.push('')
    expect(asm.received).toBe(true)
    expect(asm.text()).toBe('x')
  })
})

/* ---------------- SSE 回放 ---------------- */

const enc = new TextEncoder()

function sseResponse(frames: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

/** 一段真实形状的 SSE：若干内容增量 + 结束帧（含 finish_reason 与 usage）+ [DONE] */
function sse(deltas: string[], reason = 'stop'): string[] {
  const frames = deltas.map(
    (d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`,
  )
  frames.push(
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: reason }],
      usage: { total_tokens: 42 },
    })}\n\n`,
  )
  frames.push('data: [DONE]\n\n')
  return frames
}

function stubFetch(deltas: string[], reason = 'stop'): void {
  const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
    const wantsStream = init?.body
      ? (JSON.parse(init.body) as { stream?: boolean }).stream === true
      : false
    if (wantsStream) return sseResponse(sse(deltas, reason))
    return new Response(JSON.stringify({ choices: [{ message: { content: deltas.join('') } }] }), {
      status: 200,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
}

describe('流式与非流式一致性（SSE 回放）', () => {
  const DELTAS = ['今天', '有三节课', '，先上高数，再看算法。']

  it('completeStream 的返回值 === complete 的返回值', async () => {
    stubFetch(DELTAS)
    const p = openAICompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })

    const streamed = await p.completeStream!('q', () => {})
    const direct = await p.complete('q')

    expect(streamed).toBe(DELTAS.join(''))
    expect(direct).toBe(DELTAS.join(''))
  })

  it('onToken 收到的增量拼接 === 最终返回值（预览与定稿同源）', async () => {
    stubFetch(DELTAS)
    const p = openAICompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })
    const seen: string[] = []
    const result = await p.completeStream!('q', (d) => seen.push(d))
    expect(seen.join('')).toBe(result)
  })

  it('跨 chunk 拆开的 SSE 行也能正确解析（残缺行留到下一轮）', async () => {
    // 把一段完整 JSON 从中间切开，模拟服务端一次 flush 没送完整帧
    const whole = `data: ${JSON.stringify({ choices: [{ delta: { content: '拆开' } }] })}\n\n`
    const cut = Math.floor(whole.length / 2)
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(whole.slice(0, cut)))
        c.enqueue(enc.encode(whole.slice(cut)))
        c.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const p = openAICompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })
    await expect(p.completeStream!('q', () => {})).resolves.toBe('拆开')
  })

  it('finish_reason=length 通过 onFinish 报出（截断必须让用户知道）', async () => {
    stubFetch(['很长'], 'length')
    const p = openAICompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })
    const infos: StreamFinishInfo[] = []
    await p.completeStream!('q', () => {}, undefined, (info) => infos.push(info))
    expect(infos).toEqual([{ reason: 'length', usage: { total_tokens: 42 } }])
  })

  it('正常结束时 reason=stop 且带 usage', async () => {
    stubFetch(['ok'])
    const p = openAICompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })
    const infos: StreamFinishInfo[] = []
    await p.completeStream!('q', () => {}, undefined, (info) => infos.push(info))
    expect(infos[0].reason).toBe('stop')
  })
})

describe('withStreamSink —— 高层能力的流式通路', () => {
  const brief = () =>
    aiService.dailyBrief({
      date: '2026-09-20',
      tasksDone: 0,
      focusMin: 0,
      waterMl: 0,
      goal: 2000,
      sources: [],
    })

  it('作用域内调用能力会吐增量，且增量拼接 === 最终结果', async () => {
    stubFetch(['简报', '内容'])
    const p = openAICompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })
    aiService.use(p)

    const seen: string[] = []
    // dailyBrief 返回字符串本身（不是对象），别解构
    const body = await withStreamSink({ onDelta: (d) => seen.push(d) }, brief)

    expect(body).toBe('简报内容')
    expect(seen.join('')).toBe(body)
    expect(seen).toEqual(['简报', '内容'])
  })

  it('作用域外调用不吐增量（sink 只在 withStreamSink 内生效）', async () => {
    stubFetch(['无关'])
    const p = openAICompatibleProvider({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })
    aiService.use(p)

    const seen: string[] = []
    await brief()
    expect(seen).toEqual([])
  })

  it('中止时不降级、不标记 degraded（中止不是失败）', async () => {
    // 永远不关闭的流。⚠️ mock 的 fetch 必须自己把 signal 接到流上：
    // 真 fetch 会因 signal 中止而让 read() reject，mock 不会 —— 不接的话
    // 中止后 read() 永远挂起，测试就超时了。
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, init?: { signal?: AbortSignal }) =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"开头"}}]}\n\n'))
              },
              pull(): Promise<void> {
                return new Promise<void>((_resolve, reject) => {
                  if (init?.signal?.aborted) {
                    reject(abortErr)
                    return
                  }
                  init?.signal?.addEventListener('abort', () => reject(abortErr), { once: true })
                })
              },
            }),
            { status: 200 },
          ),
      ),
    )
    const p = openAICompatibleProvider({
      baseUrl: 'https://x/v1',
      apiKey: 'k',
      model: 'm',
      timeoutMs: 10_000,
    })
    aiService.use(p)

    const ctrl = new AbortController()
    const run = withStreamSink({ onDelta: () => {}, signal: ctrl.signal }, brief)
    // 等首字节到手再中止，确保走的是"已收到内容后被中止"而不是"还没连上"
    await new Promise((r) => setTimeout(r, 20))
    ctrl.abort()

    await expect(run).rejects.toThrow()
    expect(getAiRemoteHealth().state).not.toBe('degraded')
  })
})
