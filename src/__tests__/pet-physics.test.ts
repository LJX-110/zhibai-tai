/**
 * 桌宠 · 拖拽抛掷物理（P3）
 *
 * 这些是**纯函数**，所以可以直接把"手感"钉成断言。要守的四条（每条都对应一种用户能看见的毛病）：
 *  ① **重力与反弹**：甩出去要落、落地要弹、弹完要停（`restitution` 生效）；
 *  ② **dt 必须夹住**：切后台再回来 dt 可能是好几秒，不夹住 = 宠物一帧被甩到屏幕外（看着像瞬移）；
 *  ③ **静止判定要看两个轴**：只看垂直速度的话，水平会以 1px/s 无限滑行 ——
 *     `usePetLoop` 的 rAF 循环就永远结束不了（常驻物最不该有的空转）；
 *  ④ **甩抛速度要可信**：只取最近 120ms（"拖的时候慢慢挪"不代表松手意图）、
 *     有上限（快速划过不会把它扔出屏幕）、除以 0 不会得到 Infinity。
 *
 * 参数用 `public/pet/config.json` 里的真值，改配置忘了改这里的假设就会红。
 */
import { describe, expect, it } from 'vitest'
import { boundsOf, integrate, throwVelocity, MAX_STEP_SEC, type PhysicsBounds } from '../services/pet/physics'
import type { PhysicsParams } from '../services/pet/types'

/** 与 config.json 的 physics 段一致 */
const P: PhysicsParams = { gravity: 1400, restitution: 0.78, groundFriction: 2.5, throwPower: 1 }

/** 160×90 的宠物放在 800×600 视口里（边距 8） */
const B: PhysicsBounds = boundsOf(160, { x: 0, y: 0, width: 800, height: 600 })

/** 反复积分直到静止或达到步数上限 */
function settle(
  s: { x: number; y: number; vx: number; vy: number },
  steps = 600,
  dt = 1 / 60,
): { x: number; y: number; vx: number; vy: number; steps: number; resting: boolean } {
  let cur = s
  for (let i = 1; i <= steps; i++) {
    const r = integrate(cur, dt, P, B)
    cur = r.state
    if (r.resting) return { ...cur, steps: i, resting: true }
  }
  return { ...cur, steps, resting: false }
}

describe('boundsOf：宠物可活动范围', () => {
  it('按 16:9 推高度，四周留边距', () => {
    // 800 - 160 - 8 = 632；600 - 90 - 8 = 502
    expect(B).toEqual({ minX: 8, maxX: 632, minY: 8, maxY: 502 })
  })

  it('视口比宠物还小时，上下界重合而不是反转（否则 integreate 会左右来回夹）', () => {
    const tiny = boundsOf(160, { x: 0, y: 0, width: 100, height: 60 })
    expect(tiny.maxX).toBeGreaterThanOrEqual(tiny.minX)
    expect(tiny.maxY).toBeGreaterThanOrEqual(tiny.minY)
  })
})

describe('throwVelocity：松手速度', () => {
  it('采样不足 / 时间跨度为 0 → 0（除以 0 会得到 Infinity，宠物会被扔出天际）', () => {
    expect(throwVelocity([], 100)).toEqual({ vx: 0, vy: 0 })
    expect(throwVelocity([{ t: 0, x: 0, y: 0 }], 0)).toEqual({ vx: 0, vy: 0 })
    expect(
      throwVelocity(
        [
          { t: 500, x: 10, y: 10 },
          { t: 500, x: 90, y: 10 },
        ],
        500,
      ),
    ).toEqual({ vx: 0, vy: 0 })
  })

  it('方向与大小：向右甩 100px/100ms → 1000 px/s', () => {
    const v = throwVelocity(
      [
        { t: 0, x: 0, y: 0 },
        { t: 100, x: 100, y: 0 },
      ],
      100,
    )
    expect(v.vx).toBeCloseTo(1000, 5)
    expect(v.vy).toBeCloseTo(0, 5)
  })

  it('**只取最近 120ms** —— 拖的时候慢慢挪过 500px，不该被当成"要往那边甩"', () => {
    const v = throwVelocity(
      [
        { t: 0, x: 0, y: 0 },
        { t: 500, x: 500, y: 0 }, // 早就挪过去了
        { t: 600, x: 505, y: 0 }, // 最近 100ms 只动了 5px
      ],
      600,
    )
    expect(v.vx).toBeCloseTo(50, 5)
  })

  it('throwPower 缩放，且有速度上限（快速划过不会把宠物甩到屏幕外）', () => {
    // 0→100px / 100ms = 1000px/s，半力 → 500
    const slow = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
    ]
    expect(throwVelocity(slow, 100, 0.5).vx).toBeCloseTo(500, 5)
    // 上限是**绝对**的（在缩放之后夹）：再快的划过也不会超过它
    const fast = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 1000, y: 0 },
    ]
    expect(throwVelocity(fast, 100, 1).vx).toBe(2600)
    expect(throwVelocity(fast, 100, 0.5).vx).toBe(2600)
  })

  it('throwPower 非法（0 / 负数 / NaN）时按 1 处理，不能把速度清零', () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 0 },
    ]
    expect(throwVelocity(samples, 100, 0).vx).toBeCloseTo(1000, 5)
    expect(throwVelocity(samples, 100, Number.NaN).vx).toBeCloseTo(1000, 5)
  })
})

describe('integrate：重力 / 反弹 / 摩擦 / 静止', () => {
  it('自由落体：垂直速度按重力累积', () => {
    const r = integrate({ x: 100, y: 100, vx: 0, vy: 0 }, 1 / 60, P, B)
    expect(r.state.vy).toBeCloseTo(1400 / 60, 5)
    expect(r.state.y).toBeGreaterThan(100)
    expect(r.resting).toBe(false)
  })

  it('**dt 被夹到 1/30** —— 切后台回来时 dt 是好几秒，不夹就一帧飞到屏幕外', () => {
    const big = integrate({ x: 100, y: 100, vx: 0, vy: 0 }, 5, P, B)
    const capped = integrate({ x: 100, y: 100, vx: 0, vy: 0 }, MAX_STEP_SEC, P, B)
    expect(big.state).toEqual(capped.state)
  })

  it('落地反弹后速度变小（restitution < 1），弹几次就停在地上', () => {
    const spun = settle({ x: 100, y: 100, vx: 0, vy: 900 })
    expect(spun.resting).toBe(true)
    expect(spun.y).toBeCloseTo(B.maxY, 5)
    expect(spun.vy).toBe(0)
  })

  it('**已经贴地且不动 → 立刻判静止**（rAF 循环当场结束，不多转一帧）', () => {
    const r = settle({ x: 300, y: B.maxY, vx: 0, vy: 0 })
    expect(r.resting).toBe(true)
    expect(r.steps).toBe(1)
  })

  it('从半空落下：会落下来、弹几下、最终停在地上（而不是"贴地滑"或"永弹"）', () => {
    const r = settle({ x: 300, y: 400, vx: 0, vy: 0 })
    expect(r.resting).toBe(true)
    expect(r.y).toBeCloseTo(B.maxY, 5)
    // 一次 78px 的自由落体 + 几次递减的反弹：给足余量但仍要"该停就停"
    expect(r.steps).toBeLessThan(300)
  })

  it('地面摩擦让水平速度衰减（贴地才摩擦，腾空不减速）', () => {
    const onGround = integrate({ x: 300, y: B.maxY, vx: 200, vy: 0 }, 1 / 60, P, B)
    expect(onGround.state.vx).toBeLessThan(200)
    const airborne = integrate({ x: 300, y: 100, vx: 200, vy: 0 }, 1 / 60, P, B)
    expect(airborne.state.vx).toBe(200)
  })

  it('左墙反弹：撞墙后水平速度反向且变小', () => {
    const r = integrate({ x: B.minX + 0.1, y: 300, vx: -400, vy: 0 }, 1 / 30, P, B)
    expect(r.state.x).toBe(B.minX)
    expect(r.state.vx).toBeGreaterThan(0)
    expect(r.state.vx).toBeLessThan(400)
  })

  it('右墙同理（反向到左侧）', () => {
    const r = integrate({ x: B.maxX - 0.1, y: 300, vx: 400, vy: 0 }, 1 / 30, P, B)
    expect(r.state.x).toBe(B.maxX)
    expect(r.state.vx).toBeLessThan(0)
  })

  it('天花板也会挡住（往上甩不会飞出视口顶部）', () => {
    const r = integrate({ x: 300, y: B.minY + 0.1, vx: 0, vy: -600 }, 1 / 30, P, B)
    expect(r.state.y).toBe(B.minY)
    expect(r.state.vy).toBeGreaterThanOrEqual(0)
  })

  it('**静止判定要看两个轴**：水平还在滑就不算停（否则 rAF 循环永不结束）', () => {
    // 贴地、垂直已停，但水平还有速度 → 不算静止
    const stillMoving = integrate({ x: 300, y: B.maxY, vx: 400, vy: 0 }, 1 / 60, P, B)
    expect(stillMoving.resting).toBe(false)
    // 两轴都小 → 静止
    const atRest = integrate({ x: 300, y: B.maxY, vx: 0, vy: 0 }, 1 / 60, P, B)
    expect(atRest.resting).toBe(true)
  })

  it('抛出的宠物最终一定静止（兜底：不会永远飞）', () => {
    const r = settle({ x: 200, y: 200, vx: 1800, vy: -1500 })
    expect(r.resting).toBe(true)
    expect(r.steps).toBeLessThan(600)
  })

  it('负 dt / 非法 dt 不会倒退或爆掉', () => {
    const r = integrate({ x: 300, y: 300, vx: 0, vy: 0 }, -1, P, B)
    expect(r.state).toEqual({ x: 300, y: 300, vx: 0, vy: 0 })
    const nan = integrate({ x: 300, y: 300, vx: 0, vy: 0 }, Number.NaN, P, B)
    expect(nan.state).toEqual({ x: 300, y: 300, vx: 0, vy: 0 })
  })
})
