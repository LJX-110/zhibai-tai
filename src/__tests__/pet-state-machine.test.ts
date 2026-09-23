/**
 * 桌宠 · 动作状态机
 *
 * 时间是注入的、掷骰是注入的 → 可以精确断言"走到哪一档、下一拍安排在何时"。
 * 三条最容易出问题的地方逐条钉住：
 *  ① **段结束一定有 `until`** —— 漏了就会"宠物定住"；
 *  ② **移动失败要回退为转向** —— 否则会卡在屏幕边缘不动；
 *  ③ **reduced-motion 停位移与转向** —— 这是无障碍要求，不是可选项。
 */
import { describe, expect, it } from 'vitest'
import { decide, initialRuntime, isMoving, onPetClick, setExternalBusy, type DecideContext } from '../services/pet/state-machine'
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
    events: { busy: ['忙甲'] },
  },
  weights: { idle: 10, turn: 5, move: 5 },
  physics: { gravity: 1400, restitution: 0.78, groundFriction: 2.5, throwPower: 1 },
}

const viewport = { x: 0, y: 0, width: 1000, height: 600 }
const ctx = (over: Partial<DecideContext> = {}): DecideContext => ({
  now: 1000,
  roll: 0.5,
  cx: 500,
  cy: 300,
  viewport,
  reducedMotion: false,
  rand: (min) => min, // 固定取区间下限，便于断言 until
  ...over,
})

describe('initialRuntime', () => {
  it('初始为待机、朝左，动画取自 idle 池', () => {
    const r = initialRuntime(cfg, 0)
    expect(r.phase).toBe('idle')
    expect(r.facing).toBe('left')
    expect(cfg.animations.idle).toContain(r.anim)
    expect(r.externalBusy).toBe(false)
  })
})

describe('decide：四档随机链', () => {
  it('idle 档 → 待机，下一拍按 tickMs 下限安排（rand 注入）', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0 }))
    expect(r.phase).toBe('idle')
    expect(r.until).toBe(1000 + 4000)
  })

  it('turn 档 → 朝向翻转，且带上 until', () => {
    const prev = initialRuntime(cfg, 0)
    const r = decide(cfg, prev, ctx({ now: 1000, roll: 0.12 }))
    expect(r.phase).toBe('turn')
    expect(r.facing).toBe('right')
    expect(r.anim).toBe('东张西望')
    expect(r.until).toBeGreaterThan(1000)
  })

  it('move 档 → 有位移目标、朝向与方向一致、until 与距离相关', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17 }))
    expect(r.phase).toBe('move')
    expect(isMoving(r)).toBe(true)
    expect(r.move!.to).not.toBe(r.move!.from)
    // 朝向必须与移动方向一致（向左走却朝右，看起来就是倒着走）
    expect(r.facing).toBe(r.move!.to > r.move!.from ? 'right' : 'left')
    expect(r.until).toBeGreaterThan(1000)
  })

  it('最右贴边 → **改试另一方向**（先试右失败再试左），而不是傻等或卡住', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17, cx: 1000 }))
    expect(r.phase).toBe('move')
    expect(r.move!.to).toBeLessThan(r.move!.from)
    expect(r.facing).toBe('left')
  })

  it('视口窄到两个方向都走不通 → **回退为转向**（绝不原地不动）', () => {
    const narrow = { x: 0, y: 0, width: 120, height: 600 }
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.17, cx: 60, viewport: narrow }))
    expect(r.phase).toBe('turn')
    expect(r.until).toBeGreaterThan(1000)
  })

  it('action 档 → 从分类池取动作', () => {
    const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll: 0.9 }))
    expect(r.phase).toBe('action')
    expect(cfg.animations.categories[0].actions).toContain(r.anim)
  })

  it('**每一次决策都返回带 until 的段**（漏了就会定住）', () => {
    for (const roll of [0, 0.12, 0.17, 0.5, 0.9]) {
      const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll }))
      expect(r.until).toBeGreaterThan(1000)
    }
  })
})

describe('外部忙闲（天机联动预留）', () => {
  it('外部忙 → 进入 busy 段并播 busy 动画', () => {
    const busy = setExternalBusy(initialRuntime(cfg, 0), true)
    const r = decide(cfg, busy, ctx({ now: 1000, roll: 0.9 }))
    expect(r.phase).toBe('busy')
    expect(r.anim).toBe('忙甲')
  })

  it('外部释放 → 回到随机链（不再停在 busy）', () => {
    const busy = setExternalBusy(initialRuntime(cfg, 0), true)
    const inBusy = decide(cfg, busy, ctx({ now: 1000 }))
    const released = decide(cfg, { ...inBusy, externalBusy: false }, ctx({ now: 2000, roll: 0 }))
    expect(released.phase).toBe('idle')
  })

  it('重复设同一个值不产生新对象（避免无谓重渲染）', () => {
    const prev = initialRuntime(cfg, 0)
    expect(setExternalBusy(prev, false)).toBe(prev)
  })
})

describe('reduced-motion：停位移与转向', () => {
  it('减速偏好下永远不进入 move / turn 段', () => {
    for (const roll of [0.12, 0.17, 0.5, 0.9]) {
      const r = decide(cfg, initialRuntime(cfg, 0), ctx({ now: 1000, roll, reducedMotion: true }))
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
