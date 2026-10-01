/**
 * 桌宠 · 语义状态模型（`services/pet/state.ts`）
 *
 * 规格 §B4 的优先级表就钉在这里：**同一组输入必须永远得到同一个状态**
 * （没有随机、没有时间竞态）。这组用例是"桌宠看到的是真实世界"的机器可查证据 ——
 * 以后谁想在里面加一个 `Math.random()`，会先在这里红。
 */
import { describe, expect, it } from 'vitest'
import { PET_STATES, SLEEP_AFTER_MS, STATE_HOLD_MS, isTransient, resolvePetState, type PetContext } from '../services/pet/state'

const base: PetContext = { agent: 'idle', focusing: false, idleMs: 0, visible: true, now: 1000 }

describe('resolvePetState：确定性优先级（规格 §B4）', () => {
  it('空闲 + 无输入 → idle（唯一的兜底状态）', () => {
    expect(resolvePetState(base)).toBe('idle')
  })

  it('Agent 各阶段映射到对应状态', () => {
    for (const [agent, state] of [
      ['thinking', 'thinking'],
      ['working', 'working'],
      ['waiting', 'waiting'],
      ['success', 'success'],
      ['error', 'error'],
    ] as const) {
      expect(resolvePetState({ ...base, agent })).toBe(state)
    }
  })

  it('优先级：error > waiting > working > thinking > success > focused > idle', () => {
    // 用"同时成立"的输入验证序关系（不是并列，而是先命中先返回）
    expect(resolvePetState({ ...base, agent: 'error', focusing: true, idleMs: SLEEP_AFTER_MS + 1 })).toBe('error')
    expect(resolvePetState({ ...base, agent: 'waiting', focusing: true })).toBe('waiting')
    expect(resolvePetState({ ...base, agent: 'working', focusing: true })).toBe('working')
    expect(resolvePetState({ ...base, agent: 'thinking', focusing: true })).toBe('thinking')
    expect(resolvePetState({ ...base, agent: 'success', focusing: true })).toBe('success')
    expect(resolvePetState({ ...base, focusing: true, idleMs: SLEEP_AFTER_MS + 1 })).toBe('focused')
  })

  it('长时间无互动 → sleep（阈值就是 20 分钟）', () => {
    expect(resolvePetState({ ...base, idleMs: SLEEP_AFTER_MS - 1 })).toBe('idle')
    expect(resolvePetState({ ...base, idleMs: SLEEP_AFTER_MS })).toBe('sleep')
  })

  it('页面不可见 → sleep（后台不该空转播动画）', () => {
    expect(resolvePetState({ ...base, visible: false })).toBe('sleep')
  })

  it('同样的输入永远得到同样的输出（纯函数，无随机）', () => {
    const ctx: PetContext = { ...base, agent: 'working', focusing: true, idleMs: 12345 }
    const results = new Set(Array.from({ length: 20 }, () => resolvePetState(ctx)))
    expect(results.size).toBe(1)
  })
})

describe('短暂状态与停留节奏', () => {
  it('只有 success / error 是短暂状态（waiting / focused / sleep 是持续态）', () => {
    expect(isTransient('success')).toBe(true)
    expect(isTransient('error')).toBe(true)
    for (const s of ['idle', 'thinking', 'working', 'waiting', 'focused', 'sleep'] as const) {
      expect(isTransient(s)).toBe(false)
    }
  })

  it('保留时长：success 够看清、error 更久（5s / 12s）', () => {
    expect(STATE_HOLD_MS.success).toBe(5000)
    expect(STATE_HOLD_MS.error).toBe(12000)
  })

  it('8 个状态一个不少（配置校验与动画池要求同一份清单）', () => {
    expect([...PET_STATES].sort()).toEqual(
      ['error', 'focused', 'idle', 'sleep', 'success', 'thinking', 'waiting', 'working'],
    )
  })
})
/** 本文件的上下文构造器（该文件没有既有的 petContext 辅助，自带一个，避免跨文件依赖） */
const ctxOf = (over: Partial<PetContext> = {}): PetContext => ({
  agent: 'idle',
  focusing: false,
  idleMs: 0,
  visible: true,
  now: 1000,
  ...over,
})

describe('庆祝窗口 celebrateUntil（Step 5-2C D-4）', () => {
  it('窗口内 → success（复用既有状态，不新增 PetState 枚举值）', () => {
    expect(resolvePetState(ctxOf({ now: 1000, celebrateUntil: 2000 }))).toBe('success')
  })

  it('窗口过期 → 回到 idle（时限一到自动失效，不需要定时器）', () => {
    expect(resolvePetState(ctxOf({ now: 2000, celebrateUntil: 2000 }))).toBe('idle')
    expect(resolvePetState(ctxOf({ now: 9999, celebrateUntil: 2000 }))).toBe('idle')
  })

  it('庆祝**压过专注中**（语义优先级 SUCCESS > FOCUSED）', () => {
    expect(resolvePetState(ctxOf({ now: 1000, celebrateUntil: 2000, focusing: true }))).toBe('success')
  })

  it('**agent 阶段优先**：正在干活时不插播庆祝', () => {
    expect(resolvePetState(ctxOf({ now: 1000, celebrateUntil: 2000, agent: 'working' }))).toBe('working')
    expect(resolvePetState(ctxOf({ now: 1000, celebrateUntil: 2000, agent: 'error' }))).toBe('error')
  })

  it('**长时间没操作也会被庆祝唤醒**：按既定优先级 SUCCESS > SLEEP（如番茄钟到点自动收工）', () => {
    expect(resolvePetState(ctxOf({ now: 1000, celebrateUntil: 2000, idleMs: 99 * 60 * 1000 }))).toBe('success')
  })

  it('**页面不可见时不点亮庆祝**（点了也看不见，窗口还会在后台白白过期）', () => {
    expect(resolvePetState(ctxOf({ now: 1000, celebrateUntil: 2000, visible: false }))).toBe('sleep')
  })

  it('不传或传 0 → 与从前完全一致（可选输入，不带副作用）', () => {
    expect(resolvePetState(ctxOf({ now: 1000 }))).toBe('idle')
    expect(resolvePetState(ctxOf({ now: 1000, celebrateUntil: 0 }))).toBe('idle')
  })
})
