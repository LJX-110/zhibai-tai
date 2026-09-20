/**
 * AI 远程状态（三态）—— 「降级必须看得见」
 *
 * 起因是一个很坏的故障形态：远程调用失败被静默兜底，用户只感觉「天机忽然变笨了」，
 * 界面上没有任何提示。这里锁住三件事：
 *   ① 状态迁移正确（未配置 / 就绪 / 降级），且降级**保持**到下一次成功；
 *   ② 只在真正变化时通知订阅者（否则每次调用都会白刷一轮渲染）；
 *   ③ 失败原因能到达界面（用户据此才知道该改 Key、查额度还是查网络）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetAiRemoteHealthForTest,
  getAiRemoteHealth,
  markAiRemoteDegraded,
  markAiRemoteReady,
  markAiUnconfigured,
  reasonOf,
  subscribeAiRemoteHealth,
} from '../services/ai/health'

beforeEach(() => {
  __resetAiRemoteHealthForTest()
})

describe('状态迁移', () => {
  it('初始为未配置', () => {
    expect(getAiRemoteHealth().state).toBe('unconfigured')
    expect(getAiRemoteHealth().reason).toBeUndefined()
  })

  it('解析到远程 Provider → 就绪', () => {
    markAiRemoteReady()
    expect(getAiRemoteHealth()).toEqual({ state: 'ready' })
  })

  it('远程调用失败 → 降级，并记下原因与时刻', () => {
    markAiRemoteReady()
    markAiRemoteDegraded('HTTP 401：Invalid API key')
    const h = getAiRemoteHealth()
    expect(h.state).toBe('degraded')
    expect(h.reason).toBe('HTTP 401：Invalid API key')
    expect(h.at).toBeTruthy()
  })

  it('降级保持到下一次成功为止（不被后续本地兜底盖掉）', () => {
    markAiRemoteDegraded('第一次失败')
    // 之后的本地兜底结果不会再碰状态，所以这里状态应该还是 degraded
    expect(getAiRemoteHealth().state).toBe('degraded')
    markAiRemoteDegraded('第二次失败')
    // 最近一次失败原因生效 —— 界面要给用户看的是"现在为什么不行"
    expect(getAiRemoteHealth().reason).toBe('第二次失败')
    markAiRemoteReady()
    expect(getAiRemoteHealth()).toEqual({ state: 'ready' })
  })

  it('失效回落：远程被关掉后回到未配置（不带残留原因）', () => {
    markAiRemoteDegraded('HTTP 500')
    markAiUnconfigured()
    expect(getAiRemoteHealth()).toEqual({ state: 'unconfigured' })
  })
})

describe('订阅', () => {
  it('状态变化时通知一次', () => {
    let calls = 0
    const off = subscribeAiRemoteHealth(() => calls++)
    markAiRemoteReady()
    expect(calls).toBe(1)
    off()
  })

  it('同状态重复标记不通知（否则每次 AI 调用都会触发一轮渲染）', () => {
    markAiRemoteReady()
    let calls = 0
    const off = subscribeAiRemoteHealth(() => calls++)
    markAiRemoteReady()
    markAiRemoteReady()
    expect(calls).toBe(0)
    off()
  })

  it('原因变化算变化，要通知', () => {
    markAiRemoteDegraded('原因 A')
    let calls = 0
    const off = subscribeAiRemoteHealth(() => calls++)
    markAiRemoteDegraded('原因 B')
    expect(calls).toBe(1)
    off()
  })

  it('取消订阅后不再收到通知', () => {
    let calls = 0
    const off = subscribeAiRemoteHealth(() => calls++)
    off()
    markAiRemoteReady()
    markAiRemoteDegraded('之后')
    expect(calls).toBe(0)
  })
})

describe('reasonOf —— 失败原因转人话', () => {
  it('Error 取 message，字符串原样，对象走 JSON', () => {
    expect(reasonOf(new Error('请求超时'))).toBe('请求超时')
    expect(reasonOf('直接抛字符串')).toBe('直接抛字符串')
    expect(reasonOf({ code: 429 })).toBe('{"code":429}')
  })

  it('循环引用不抛错', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => reasonOf(cyclic)).not.toThrow()
  })
})
