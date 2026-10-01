/**
 * 桌宠 · 动作状态机（Step 4-2 重做后）
 *
 * 时间是注入的、掷骰是注入的 → 可以精确断言"走到哪一档、下一拍安排在何时"。
 * 这一版钉住的是**状态驱动**的五条不变式：
 *  ① **语义状态优先**：Agent / 番茄钟的状态决定动画，随机链只在 idle 时参与；
 *  ② **短暂状态只报一次**：success / error 保留期一过就回落，不会反复庆祝；
 *  ③ **同一状态不打断动画**：`until` 之前重算返回原对象（订阅驱动的即时 tick 靠它）；
 *  ④ **漫游默认关**：位置是用户的设定，`wander: false` 时永不产生 move 段；
 *  ⑤ **reduced-motion 停位移与转向** —— 无障碍要求，不是可选项。
 */
import { describe, expect, it } from 'vitest'
import { decide, initialRuntime, isMoving, onPetClick, type DecideContext } from '../services/pet/state-machine'
import { pickStateAnim as stateAnim } from '../services/pet/animation-policy'
import { STATE_HOLD_MS, type PetContext, type PetState } from '../services/pet/state'
import type { PetConfig } from '../services/pet/types'

const cfg: PetConfig = {
  name: '知白',
  size: 160,
  position: { corner: 'bottom-right', marginX: 12, marginY: 96 },
  tickMs: { min: 4000, max: 9000 },
  animations: {
    idle: ['待机甲', '待机乙'],
    turn: ['东张西望'],
    clicks: ['应甲', '应乙'],
    moves: { default: {}, actions: [{ name: '走甲' }, { name: '走乙' }] },
    categories: [{ id: 'c1', weight: 80, actions: ['动作甲', '动作乙'] }],
    events: { dragging: ['被拎起来'] },
    states: {
      idle: ['待机甲'],
      thinking: ['思考'],
      working: ['工作'],
      waiting: ['等待'],
      success: ['庆祝'],
      error: ['黑脸'],
      focused: ['专注'],
      sleep: ['睡觉'],
    },
  },
  weights: { idle: 10, turn: 5, move: 5 },
}

const viewport = { x: 0, y: 0, width: 1000, height: 600 }

/** 真实应用状态的默认值：Agent 空闲、不在专注、刚互动过、可见 */
const petContext = (over: Partial<PetContext> = {}): PetContext => ({
  agent: 'idle',
  focusing: false,
  idleMs: 0,
  visible: true,
  now: 1000,
  ...over,
})

const ctx = (over: Partial<DecideContext> = {}): DecideContext => ({
  now: 1000,
  roll: 0.5,
  cx: 500,
  cy: 300,
  viewport,
  // 运行时实际尺寸（effectiveSize）—— 状态机的几何口径，见 services/pet/geometry
  size: cfg.size,
  reducedMotion: false,
  wander: false,
  context: petContext(),
  rand: (min) => min, // 固定取区间下限，便于断言 until
  ...over,
})

/** 造一个"已经在某个语义状态里"的运行时（用于测状态切换与保留期） */
const at = (state: PetState, until: number, anim = stateAnim(cfg, state, 0)) => ({
  ...initialRuntime(cfg, 0),
  state,
  phase: (state === 'idle' ? 'idle' : 'state') as 'idle' | 'state',
  anim,
  until,
})

describe('initialRuntime', () => {
  it('初始为待机、朝左，动画取自 idle 池（语义状态留给第一次 decide 去认）', () => {
    const r = initialRuntime(cfg, 0)
    expect(r.phase).toBe('idle')
    expect(r.state).toBe('idle')
    expect(r.facing).toBe('left')
    expect(cfg.animations.idle).toContain(r.anim)
  })
})

describe('状态驱动：真实应用状态 → 动画（规格 §B4 优先级）', () => {
  it('Agent 思考中 → thinking 动画（不是随机摸鱼）', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ context: petContext({ agent: 'thinking' }) }))
    expect(r.state).toBe('thinking')
    expect(r.phase).toBe('state')
    expect(r.anim).toBe('思考')
  })

  it('Agent 执行工具 → working；等待确认 → waiting（等待优先于执行）', () => {
    const working = decide(cfg, initialRuntime(cfg, 0), ctx({ context: petContext({ agent: 'working' }) }))
    expect(working.state).toBe('working')
    expect(working.anim).toBe('工作')
    const waiting = decide(cfg, initialRuntime(cfg, 0), ctx({ context: petContext({ agent: 'waiting' }) }))
    expect(waiting.state).toBe('waiting')
    expect(waiting.anim).toBe('等待')
  })

  it('出错 → error（优先级最高：先看见问题，再谈表演）', () => {
    const r = decide(
      cfg,
      initialRuntime(cfg, 0),
      ctx({ context: petContext({ agent: 'error', focusing: true }) }),
    )
    expect(r.state).toBe('error')
    expect(r.anim).toBe('黑脸')
  })

  it('番茄钟专注中 → focused（Agent 空闲时才轮到它）', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ context: petContext({ focusing: true }) }))
    expect(r.state).toBe('focused')
    expect(r.anim).toBe('专注')
  })

  it('长时间无互动 → sleep（20 分钟）', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ context: petContext({ idleMs: 21 * 60 * 1000 }) }))
    expect(r.state).toBe('sleep')
    expect(r.anim).toBe('睡觉')
  })

  it('状态动画池缺失时退到 idle 池（**绝不让宠物凭空消失**）', () => {
    const broken: PetConfig = {
      ...cfg,
      animations: { ...cfg.animations, states: { ...cfg.animations.states, error: [] } },
    }
    expect(stateAnim(broken, 'error', 0)).toBeTruthy()
  })
})

describe('短暂状态：只报一次（不会反复庆祝）', () => {
  it('success 在保留期内维持同一动画', () => {
    const hold = STATE_HOLD_MS.success ?? 5000
    const prev = at('success', 1000 + hold, '庆祝')
    // 保留期内即使 Agent 已回到 idle，也继续播庆祝
    const r = decide(cfg, prev, ctx({ now: 2000, context: petContext({ agent: 'idle' }) }))
    expect(r.state).toBe('success')
    expect(r.anim).toBe('庆祝')
    expect(r.until).toBe(1000 + hold)
  })

  it('保留期一到就回落（Agent 还停在 success 也不再庆祝）', () => {
    const prev = at('success', 6000, '庆祝')
    const r = decide(cfg, prev, ctx({ now: 6000, context: petContext({ agent: 'success' }) }))
    expect(r.state).toBe('idle')
  })

  it('error 同理：保留期内留住，到期回落到真实状态', () => {
    const prev = at('error', 13000, '黑脸')
    expect(decide(cfg, prev, ctx({ now: 12000, context: petContext({ agent: 'idle' }) })).state).toBe('error')
    expect(decide(cfg, prev, ctx({ now: 13000, context: petContext({ agent: 'idle' }) })).state).toBe('idle')
  })
})

describe('同一状态不打断动画（订阅驱动的即时重算是安全操作）', () => {
  it('状态没变且段未结束 → 原样返回同一个对象', () => {
    const prev = at('thinking', 5000, '思考')
    const r = decide(cfg, prev, ctx({ now: 2000, context: petContext({ agent: 'thinking' }) }))
    expect(r).toBe(prev)
  })

  it('状态变了 → 立刻切换（不受 until 限制）', () => {
    const prev = at('thinking', 5000, '思考')
    const r = decide(cfg, prev, ctx({ now: 2000, context: petContext({ agent: 'waiting' }) }))
    expect(r.state).toBe('waiting')
    expect(r.anim).toBe('等待')
  })

  it('**每一次决策都返回带 until 的段**（漏了就会定住）', () => {
    for (const agent of ['idle', 'thinking', 'working', 'waiting', 'success', 'error'] as const) {
      const r = decide(cfg, initialRuntime(cfg, 0), ctx({ context: petContext({ agent }) }))
      expect(r.until).toBeGreaterThan(1000)
    }
  })
})

describe('idle 的闲暇表现（随机只在这一层）', () => {
  it('idle 档 → 待机，下一拍按 tickMs 下限安排（rand 注入）', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0 }))
    expect(r.state).toBe('idle')
    expect(r.phase).toBe('idle')
    expect(r.until).toBe(1000 + 4000)
  })

  it('turn 档 → 朝向翻转', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.12 }))
    expect(r.phase).toBe('turn')
    expect(r.facing).toBe('right')
    expect(r.anim).toBe('东张西望')
  })

  it('action 档 → 从分类池取动作', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.9 }))
    expect(r.phase).toBe('action')
    expect(cfg.animations.categories[0].actions).toContain(r.anim)
  })

  it('**漫游默认关**：抽到 move 档也不产生位移（改成一次小动作）', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17 }))
    expect(r.phase).not.toBe('move')
    expect(isMoving(r)).toBe(false)
    expect(r.move).toBeUndefined()
  })

  it('打开漫游后 move 档才真的走（且有位移目标、朝向与方向一致）', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17, wander: true }))
    expect(r.phase).toBe('move')
    expect(isMoving(r)).toBe(true)
    expect(r.move!.to).not.toBe(r.move!.from)
    expect(r.facing).toBe(r.move!.to > r.move!.from ? 'right' : 'left')
  })

  it('打开漫游且最右贴边 → 改试另一方向，而不是傻等', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17, cx: 1000, wander: true }))
    expect(r.phase).toBe('move')
    expect(r.facing).toBe('left')
  })

  it('打开漫游但视口窄到两向都走不通 → 回退为转向（绝不原地不动）', () => {
    const narrow = { x: 0, y: 0, width: 120, height: 600 }
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17, cx: 60, viewport: narrow, wander: true }))
    expect(r.phase).toBe('turn')
  })

  it('漫游的比例是**活动矩形内的局部比例**（矩形有原点时也不越界）', () => {
    const shifted = { x: 0, y: 80, width: 1000, height: 440 }
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17, cx: 500, cy: 300, viewport: shifted, wander: true }))
    expect(r.phase).toBe('move')
    expect(r.move!.from).toBeCloseTo(500 / 1000, 5)
    // Step 5-3E：move **只描述水平移动** —— 不再带 yRatio（那会把"身体中心"当左上角用，
    // 每次移动把宠物往下推半个身高，几段之后贴底"看起来再也不动"）
    expect('yRatio' in (r.move as object)).toBe(false)
  })

  it('手机窄视口也能真的走出一步（Step 5-3E 修"开了漫游也不动"）', () => {
    // 390 宽：旧实现步长固定 size*1.5~size*5（240~800px），目标必然越界 → 永远回退转向
    const phone = { x: 0, y: 0, width: 390, height: 700 }
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17, cx: 195, viewport: phone, wander: true }))
    expect(r.phase).toBe('move')
    expect(r.move!.from).toBeGreaterThan(0)
    expect(r.move!.to).toBeGreaterThan(0)
    expect(r.move!.to).toBeLessThanOrEqual(1)
  })
})

describe('reduced-motion：停位移与转向', () => {
  it('减速偏好下永远不进入 move / turn 段', () => {
    for (const roll of [0.12, 0.17, 0.5, 0.9]) {
      const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll, reducedMotion: true, wander: true }))
      expect(r.phase === 'move' || r.phase === 'turn').toBe(false)
      expect(isMoving(r)).toBe(false)
    }
  })

  it('减速偏好下仍有 idle 与 action（不是完全不动）', () => {
    const idle = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.1, reducedMotion: true }))
    const action = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.9, reducedMotion: true }))
    expect(idle.phase).toBe('idle')
    expect(action.phase).toBe('action')
  })
})

describe('点击回应 onPetClick', () => {
  it('抢断当前段并播点击池里的动画', () => {
    const r = onPetClick(cfg, initialRuntime(cfg, 0), 1000, 0)
    expect(r.phase).toBe('clicked')
    expect(r.anim).toBe('应甲')
    expect(r.until).toBeGreaterThan(1000)
    expect(r.move).toBeUndefined()
  })

  it('roll=1 时取最后一个（不越界）', () => {
    expect(onPetClick(cfg, initialRuntime(cfg, 0), 1000, 1).anim).toBe('应乙')
  })

  it('点击池为空时原样返回（不崩）', () => {
    const empty: PetConfig = { ...cfg, animations: { ...cfg.animations, clicks: [] } }
    const prev = initialRuntime(cfg, 0)
    expect(onPetClick(empty, prev, 1000)).toBe(prev)
  })
})