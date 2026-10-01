/**
 * 天机 × 桌宠 联动（Step 4-2 · D1/D2/D3）—— **单向数据流的端到端断言**
 *
 * ```
 * AgentStatus ──► PetContext ──► resolvePetState ──► decide ──► 动画 + 台词
 * ```
 * 这组用例把整条链放在一起跑（只跨纯函数与状态模块，不碰 DOM）：
 *  · 天机推演 → 桌宠 thinking / 执行工具 → working / 等确认 → waiting / 成功 → success / 失败 → error；
 *  · 番茄钟专注 → focused；长时间无互动 → sleep；
 *  · **状态优先于表演**：人格只改台词，不改状态（D3）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetAgentStatusForTest, beginAgentRun, getAgentStatus, setAgentStatus } from '../services/agent/status'
import { resolvePetState, type PetContext } from '../services/pet/state'
import { decide, initialRuntime, type DecideContext } from '../services/pet/state-machine'
import { stateSaying } from '../services/pet/sayings'
import { voiceFromPersona } from '../services/pet/voice'
import { defaultWhaleGirlPersona } from '../services/persona/defaults'
import type { PetConfig } from '../services/pet/types'

const cfg: PetConfig = {
  name: '知白',
  size: 160,
  position: { corner: 'bottom-right', marginX: 12, marginY: 96 },
  tickMs: { min: 4000, max: 9000 },
  animations: {
    idle: ['待机'],
    turn: ['张望'],
    clicks: ['回应'],
    moves: { default: {}, actions: [{ name: '走' }] },
    categories: [{ id: 'c', weight: 80, actions: ['小动作'] }],
    events: { dragging: ['被拎起来'] },
    states: {
      idle: ['待机'],
      thinking: ['思考冒泡'],
      working: ['清点归档'],
      waiting: ['踱步张望'],
      success: ['雀跃庆祝'],
      error: ['垂头叹气'],
      focused: ['轻快记录'],
      sleep: ['小憩沉眠'],
    },
  },
  weights: { idle: 10, turn: 5, move: 5 },
}

const viewport = { x: 0, y: 0, width: 1000, height: 600 }

/** 组装一次决策上下文（桌宠侧的"世界"来自 AgentStatus，这里如实转接） */
function ctx(o: { focusing?: boolean; idleMs?: number } = {}): DecideContext {
  const agent = getAgentStatus()
  const context: PetContext = {
    agent: agent.phase,
    focusing: o.focusing ?? false,
    idleMs: o.idleMs ?? 0,
    visible: true,
    now: 1000,
  }
  return {
    now: 1000,
    roll: 0.9, // 掷到"小动作"档也无所谓：语义状态优先，随机链只在 idle 参与
    cx: 500,
    cy: 300,
    viewport,
    size: cfg.size,
    reducedMotion: false,
    wander: false,
    context,
    rand: (min) => min,
  }
}

beforeEach(() => {
  __resetAgentStatusForTest()
})

describe('AgentStatus → PetState → 动画（D2 映射表）', () => {
  it('天机开始推演 → thinking + 思考动画', () => {
    beginAgentRun('今天有什么课')
    expect(getAgentStatus().phase).toBe('thinking')
    expect(resolvePetState(ctx().context)).toBe('thinking')
    const r = decide(cfg, initialRuntime(cfg, 0), ctx())
    expect(r.state).toBe('thinking')
    expect(r.anim).toBe('思考冒泡')
  })

  it('执行工具 → working + 工作动画', () => {
    setAgentStatus({ phase: 'working', currentTool: 'tasks.search' })
    expect(resolvePetState(ctx().context)).toBe('working')
    expect(decide(cfg, initialRuntime(cfg, 0), ctx()).anim).toBe('清点归档')
  })

  it('等你确认 → waiting + 等待动画（这时必须叫得动人）', () => {
    setAgentStatus({ phase: 'waiting', currentTask: '等你确认' })
    expect(resolvePetState(ctx().context)).toBe('waiting')
    expect(decide(cfg, initialRuntime(cfg, 0), ctx()).anim).toBe('踱步张望')
  })

  it('成功 → success + 庆祝动画；失败 → error + 黑脸动画', () => {
    setAgentStatus({ phase: 'success' })
    expect(decide(cfg, initialRuntime(cfg, 0), ctx()).anim).toBe('雀跃庆祝')
    __resetAgentStatusForTest()
    setAgentStatus({ phase: 'error', errorMessage: 'HTTP 401' })
    expect(decide(cfg, initialRuntime(cfg, 0), ctx()).anim).toBe('垂头叹气')
  })

  it('番茄钟专注 → focused；长时间无互动 → sleep', () => {
    expect(resolvePetState(ctx({ focusing: true }).context)).toBe('focused')
    expect(decide(cfg, initialRuntime(cfg, 0), ctx({ focusing: true })).anim).toBe('轻快记录')
    expect(resolvePetState(ctx({ idleMs: 21 * 60 * 1000 }).context)).toBe('sleep')
    expect(decide(cfg, initialRuntime(cfg, 0), ctx({ idleMs: 21 * 60 * 1000 })).anim).toBe('小憩沉眠')
  })

  it('天机收工回 idle → 桌宠也回 idle（不再假装还在忙）', () => {
    beginAgentRun()
    setAgentStatus({ phase: 'working' })
    expect(resolvePetState(ctx().context)).toBe('working')
    setAgentStatus({ phase: 'idle' })
    expect(resolvePetState(ctx().context)).toBe('idle')
  })
})

describe('人格只决定"怎么说"，不决定"发生了什么"（D3）', () => {
  const voice = voiceFromPersona(defaultWhaleGirlPersona('2026-09-28T10:00:00.000Z'))

  it('台词跟着人设的自称 / 称呼走', () => {
    expect(stateSaying('thinking', voice)?.text).toContain('本鲸')
    expect(stateSaying('waiting', voice)?.text).toContain('主人')
  })

  it('**状态不会被台词改写**：等待就是等待，不会因为人设"想睡觉"而变成 sleep', () => {
    setAgentStatus({ phase: 'waiting' })
    // 台词是"等你点一下"，状态仍是 waiting（人格不得覆盖真实状态）
    expect(stateSaying('waiting', voice)?.text).toContain('点一下')
    expect(resolvePetState(ctx({ idleMs: 99 * 60 * 1000 }).context)).toBe('waiting')
  })

  it('idle 阶段不产出状态台词（安静陪伴）', () => {
    expect(stateSaying('idle', voice)).toBeNull()
  })
})

describe('台词不写成话痨（Step 4-3 · 八）', () => {
  const voice = voiceFromPersona(defaultWhaleGirlPersona('2026-09-28T10:00:00.000Z'))
  const lines = (['thinking', 'working', 'waiting', 'success', 'error'] as const).map((p) => ({
    phase: p,
    text: stateSaying(p, voice)?.text ?? '',
  }))

  it('五句各不相同（不是同一句换个词）', () => {
    expect(new Set(lines.map((l) => l.text)).size).toBe(lines.length)
  })

  it('working 进入"认真模式"：短、去掉称呼与语气词', () => {
    const t = lines.find((l) => l.phase === 'working')!.text
    expect(t.length).toBeLessThanOrEqual(8)
    expect(t).not.toContain('主人')
    expect(t).not.toContain('哼')
  })

  it('error 短促且不撒娇（失败时用户要的是线索，不是语气词）', () => {
    const t = lines.find((l) => l.phase === 'error')!.text
    expect(t.length).toBeLessThanOrEqual(12)
    expect(t).not.toContain('本鲸')
    expect(t).not.toContain('主人')
  })

  it('waiting 一定带称呼（这时必须叫得动人），但不带傲娇前置', () => {
    const t = lines.find((l) => l.phase === 'waiting')!.text
    expect(t).toContain('主人')
    expect(t).not.toContain('哼')
  })

  it('没有任何一句是无信息量的假文案（"好像出了问题"这种）', () => {
    for (const l of lines) {
      expect(l.text, l.phase).not.toMatch(/好像|可能是哪里|出了问题哦/)
    }
  })
})