/**
 * 桌宠 · AI 台词（Step 5-3E）
 *
 * 这一组用例只钉**回退契约**：任何异常路径都必须返回 null（调用方据此用本地台词），
 * 以及每日上限与"预取队列取走即空"这两个节流行为。
 * 真实模型质量不在这里测 —— 那是运行时的观感（需要 Key 与耳朵/眼睛）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 可控的假 Provider：由每个用例设置 complete 的行为 */
const completeMock = vi.fn<() => Promise<string>>()

vi.mock('../services/ai/ai-service', () => ({
  resolveAIProvider: async () => ({ id: 'fake', label: 'fake', complete: completeMock }),
}))

const {
  requestPetLine,
  peekPetLine,
  prefetchPetLine,
  aiLineCountToday,
  __resetPetAiSpeechForTest,
} = await import('../services/pet/ai-speech')

const voice = { self: '本鲸', master: '主人', food: '小鱼干' }

beforeEach(() => {
  __resetPetAiSpeechForTest()
  completeMock.mockReset()
})

describe('AI 台词：成功路径', () => {
  it('正常返回时清洗引号与换行，并计入当日条数', async () => {
    completeMock.mockResolvedValue('“主人，今天也要好好干活哦”\n')
    const line = await requestPetLine({ voice, scene: '日常' })
    expect(line).toBe('主人，今天也要好好干活哦')
    expect(aiLineCountToday()).toBe(1)
  })
})

describe('AI 台词：回退契约（一律 null）', () => {
  it('模型抛错 → null（调用方回退本地台词）', async () => {
    completeMock.mockRejectedValue(new Error('HTTP 401'))
    expect(await requestPetLine({ voice, scene: '日常' })).toBeNull()
    expect(aiLineCountToday()).toBe(0)
  })

  it('模型返回空 / 超长 → null（不把坏内容塞进气泡）', async () => {
    completeMock.mockResolvedValue('   ')
    expect(await requestPetLine({ voice, scene: '日常' })).toBeNull()
    completeMock.mockResolvedValue('啊'.repeat(80))
    expect(await requestPetLine({ voice, scene: '日常' })).toBeNull()
  })

  it('达到每日上限后不再请求（直接回退）', async () => {
    completeMock.mockResolvedValue('一句台词')
    for (let i = 0; i < 20; i++) await requestPetLine({ voice, scene: '日常' })
    expect(aiLineCountToday()).toBe(20)
    completeMock.mockClear()
    expect(await requestPetLine({ voice, scene: '日常' })).toBeNull()
    expect(completeMock).not.toHaveBeenCalled()
  })
})

describe('AI 台词：预取队列', () => {
  it('预取成功后，取走即空（下一次要重新备）', async () => {
    completeMock.mockResolvedValue('备好的一句')
    prefetchPetLine({ voice, scene: '日常' })
    // 预取是 fire-and-forget（内部还有动态 import 等多个微任务）→ 轮询到它落地
    let line: string | null = null
    for (let i = 0; i < 40 && line === null; i++) {
      await new Promise((r) => setTimeout(r, 5))
      line = peekPetLine()
    }
    expect(line).toBe('备好的一句')
    expect(peekPetLine()).toBeNull()
  })
})