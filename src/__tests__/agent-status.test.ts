/**
 * Agent 状态（Step 4-2 · D1）—— 天机与桌宠之间那条**单向数据流**的源头
 *
 * 这组用例守三件事：
 *  · **只在真变化时通知**（浅比较后再 commit —— 否则每轮工具调用都会触发一轮渲染）；
 *  · **begin / end 的语义**（开始一轮要清掉上一轮的结束信息与错误，收工要回 idle）；
 *  · **失败必须带原因**（界面上只说"出错"等于把用户扔在原地）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetAgentStatusForTest,
  beginAgentRun,
  endAgentRun,
  getAgentStatus,
  setAgentStatus,
  subscribeAgentStatus,
} from '../services/agent/status'

beforeEach(() => {
  __resetAgentStatusForTest()
})

describe('订阅与通知', () => {
  it('初始为 idle', () => {
    expect(getAgentStatus().phase).toBe('idle')
  })

  it('值真的变了才通知（同值重复 set 不触发）', () => {
    const spy = vi.fn()
    const off = subscribeAgentStatus(spy)
    setAgentStatus({ phase: 'thinking' })
    setAgentStatus({ phase: 'thinking' })
    setAgentStatus({ phase: 'thinking', currentTask: '推演中' })
    expect(spy).toHaveBeenCalledTimes(2)
    off()
  })

  it('退订后不再收到通知', () => {
    const spy = vi.fn()
    subscribeAgentStatus(spy)()
    setAgentStatus({ phase: 'working' })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('begin / end（一轮的生命周期）', () => {
  it('begin 清掉上一轮的结束信息与错误，并进入 thinking', () => {
    setAgentStatus({ phase: 'error', errorMessage: 'HTTP 401', finishedAt: 1, currentTool: 'tasks.search' })
    beginAgentRun('问问天气')
    const s = getAgentStatus()
    expect(s.phase).toBe('thinking')
    expect(s.currentTask).toBe('问问天气')
    expect(s.step).toBe(1)
    expect(s.startedAt).toBeTypeOf('number')
    // 旧错误不该继续挂着（否则桌宠一直黑脸）
    expect(s.errorMessage).toBeUndefined()
    expect(s.currentTool).toBeUndefined()
    expect(s.finishedAt).toBeUndefined()
  })

  it('end 回 idle 并记结束时刻', () => {
    beginAgentRun()
    endAgentRun()
    const s = getAgentStatus()
    expect(s.phase).toBe('idle')
    expect(s.finishedAt).toBeTypeOf('number')
  })

  it('error 一定带原因（否则用户无法判断该改什么）', () => {
    setAgentStatus({ phase: 'error', errorMessage: 'HTTP 429：触发限流' })
    expect(getAgentStatus().errorMessage).toContain('429')
  })
})