/**
 * 桌宠 · idle 闲暇素材的会话上限（Step 5-1 · E1）
 *
 * 产品约定：**每个应用会话最多加载 20 个不同的 idle 素材**，到顶后只从已加载的那批里挑；
 * 素材本身**不删**。这组用例钉住三件事：
 *  ① 额度内有新增、到顶后**不再出现新名字**（= 不再产生新的下载）；
 *  ② **池永远不会空** —— 上限不能把宠物逼到"没有动画可播"（那会表现为定帧/消失）；
 *  ③ 语义状态**不受**这个上限限制（它们是必备表现，不是闲暇）。
 *
 * 用的是真实 `config.json`（82 张闲暇素材），所以"到顶"是在真实池子上验证的。
 */
import { describe, expect, it } from 'vitest'
import {
  IDLE_SESSION_LIMIT,
  canLoadMoreIdle,
  categoriesWithin,
  idleEraNames,
  idlePoolWithin,
  markIdleLoaded,
} from '../services/pet/idle-pool'
import { decide, initialRuntime, type DecideContext } from '../services/pet/state-machine'
import { validatePetConfig } from '../services/pet/config'
import type { PetContext } from '../services/pet/state'
import rawConfig from '../../public/pet/config.json?raw'
import type { Category, PetConfig } from '../services/pet/types'

const cfg: PetConfig = validatePetConfig(JSON.parse(rawConfig) as unknown)
const IDLE_NAMES = [...idleEraNames(cfg)]

/** 造一个"已加载前 n 个闲暇素材"的集合（n 可超过上限，用于模拟闸门关闭） */
const loadedOf = (n: number): Set<string> => new Set(IDLE_NAMES.slice(0, n))

const worldState = (over: Partial<PetContext> = {}): PetContext => ({
  agent: 'idle',
  focusing: false,
  idleMs: 0,
  visible: true,
  now: 1000,
  ...over,
})

/** 状态池里的全部名字 */
const stateNames = (): Set<string> => {
  const set = new Set<string>()
  for (const pool of Object.values(cfg.animations.states)) for (const n of pool) set.add(n)
  return set
}
/** 只出现在状态池（闲暇池里没有）的名字 */
const stateOnlyNames = (): string[] => [...stateNames()].filter((n) => !idleEraNames(cfg).has(n))
/** 被闲暇池与状态池同时引用的名字 */
const sharedStateNames = (): string[] => [...stateNames()].filter((n) => idleEraNames(cfg).has(n))

const viewport = { x: 0, y: 0, width: 400, height: 800 }

/** 一个"正处在 idle 段、且立刻可再决策"的运行时 */
const idleRuntime = (): ReturnType<typeof initialRuntime> => ({
  ...initialRuntime(cfg, 0),
  state: 'idle',
  phase: 'idle',
  until: 0,
})

function ctxOf(over: Partial<DecideContext> = {}): DecideContext {
  return {
    now: 10_000,
    roll: 0.5,
    cx: 300,
    cy: 500,
    viewport,
    size: 160,
    reducedMotion: false,
    wander: false,
    context: worldState(),
    ...over,
  }
}

describe('额度判定 canLoadMoreIdle', () => {
  it('小于上限 → 还有额度；等于 / 超过 → 没有', () => {
    expect(canLoadMoreIdle(loadedOf(0), 20)).toBe(true)
    expect(canLoadMoreIdle(loadedOf(19), 20)).toBe(true)
    expect(canLoadMoreIdle(loadedOf(20), 20)).toBe(false)
    expect(canLoadMoreIdle(loadedOf(25), 20)).toBe(false)
  })

  it('默认上限是 20（产品约定，别随手改）', () => {
    expect(IDLE_SESSION_LIMIT).toBe(20)
  })
})

describe('候选池收敛 idlePoolWithin', () => {
  it('没给已加载集合 → 原样返回（旧调用点与既有单测不受影响）', () => {
    expect(idlePoolWithin(['a', 'b'], undefined)).toEqual(['a', 'b'])
  })

  it('还有额度 → 原池（允许出现新名字 = 允许一次新的下载）', () => {
    expect(idlePoolWithin(['a', 'b'], new Set(['a']), 20)).toEqual(['a', 'b'])
  })

  it('到上限 → 只保留已加载过的名字', () => {
    const full = loadedOf(20)
    const out = idlePoolWithin(IDLE_NAMES, full, 20)
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(IDLE_NAMES.length)
    expect(out.every((n) => full.has(n))).toBe(true)
  })

  it('**收敛后为空时退回原池** —— 绝不让池空（空池 = 宠物定帧）', () => {
    expect(idlePoolWithin(['x', 'y'], loadedOf(20), 20)).toEqual(['x', 'y'])
  })

  it('到顶且本池整池未加载 → 先用 fallback 里**已加载过**的名字（Step 5-3E，不引入新下载）', () => {
    const full = loadedOf(20)
    const loadedName = [...full][0]!
    const pool = ['从未加载过 A']
    expect(idlePoolWithin(pool, full, 20, [loadedName])).toEqual([loadedName])
    // fallback 也没加载过 → 才退回原池（"宁可多下一次，也不能没有动画"）
    expect(idlePoolWithin(pool, full, 20, ['也没加载过'])).toEqual(pool)
    expect(idlePoolWithin(pool, full, 20)).toEqual(pool)
  })

  it('空池原样返回（调用方另有兜底）', () => {
    expect(idlePoolWithin([], loadedOf(20), 20)).toEqual([])
  })
})

describe('分类池收敛 categoriesWithin', () => {
  const cats: Category[] = [
    { id: 'c1', weight: 50, actions: ['只有旧的', '新的 A'] },
    { id: 'c2', weight: 50, actions: ['新的 B'] },
  ]

  it('还有额度 → **原引用**返回（每次决策都会调它，不做无谓拷贝）', () => {
    expect(categoriesWithin(cats, new Set(['只有旧的']), 20)).toBe(cats)
    expect(categoriesWithin(cats, loadedOf(3), 20)).toBe(cats)
    expect(categoriesWithin(cats, undefined, 20)).toBe(cats)
  })

  it('到上限 → 只留已加载的动作，且**空分类被剔除**', () => {
    // 闸门关闭（集合大小 ≥ 上限）；名字要与分类池里的对得上才有得挑
    const full = new Set(['只有旧的', ...IDLE_NAMES.slice(0, 20)])
    const out = categoriesWithin(cats, full, 20)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('c1')
    expect(out[0].actions).toEqual(['只有旧的'])
  })

  it('全空则退回原分类池（不为空）—— 上限绝不能把宠物逼到没动画', () => {
    // 已到上限，但里面没有一个名字属于这个分类池
    expect(categoriesWithin(cats, loadedOf(20), 20)).toEqual(cats)
  })
})

describe('计数 markIdleLoaded', () => {
  it('新名字计入；重复的不重复计', () => {
    const set = new Set<string>()
    expect(markIdleLoaded(set, '甲', 3)).toBe(true)
    expect(markIdleLoaded(set, '甲', 3)).toBe(false)
    expect(set.size).toBe(1)
  })

  it('到上限后不再计入（这正是"不再新增下载"的闸门）', () => {
    const set = new Set(['甲', '乙'])
    expect(markIdleLoaded(set, '丙', 3)).toBe(true)
    expect(markIdleLoaded(set, '丁', 3)).toBe(false)
    expect(set.size).toBe(3)
  })
})

describe('哪些名字计入上限（idleEraNames）', () => {
  it('含待机 / 转向 / 漫游 / 分类动作', () => {
    const names = idleEraNames(cfg)
    for (const n of cfg.animations.idle) expect(names.has(n)).toBe(true)
    for (const n of cfg.animations.turn) expect(names.has(n)).toBe(true)
    for (const a of cfg.animations.moves.actions) expect(names.has(a.name)).toBe(true)
    for (const c of cfg.animations.categories) for (const n of c.actions) expect(names.has(n)).toBe(true)
  })

  it('**不含**点击应答，也不含"只属于状态池"的动画（它们不该被闲暇额度挤掉）', () => {
    const names = idleEraNames(cfg)
    for (const n of cfg.animations.clicks) expect(names.has(n), n).toBe(false)
    for (const n of stateOnlyNames()) {
      expect(names.has(n), `${n} 只属状态池，不该计入闲暇额度`).toBe(false)
    }
  })

  it('有少量素材被闲暇池与状态池**共用**（配置有意为之：它既会被闲暇链播到，也会被状态播到）', () => {
    const shared = sharedStateNames()
    expect(shared.length).toBeGreaterThan(0)
    // 共用素材**应当**计入额度 —— 因为闲暇链确实会把它拉下来
    for (const n of shared) expect(idleEraNames(cfg).has(n), n).toBe(true)
  })

  it('真实配置下闲暇池够大 —— 这正是需要上限的原因', () => {
    expect(IDLE_NAMES.length).toBeGreaterThan(50)
  })
})

describe('接进状态机之后（E1 的核心断言）', () => {
  const LIMIT = 5

  /** 反复 idle 决策：返回这一轮出现过的名字，并按"运行时口径"记账 */
  function pump(loaded: Set<string>, rounds: number, wander: boolean): Set<string> {
    let rt = idleRuntime()
    const seen = new Set<string>()
    for (let i = 0; i < rounds; i++) {
      const next = decide(
        cfg,
        rt,
        ctxOf({
          now: 10_000 + i * 1000,
          // roll 走遍四档权重（idle/turn/move/action），避免只抽到同一类
          roll: ((i * 37) % 100) / 100,
          wander,
          idleLoaded: loaded,
          idleLimit: LIMIT,
          context: worldState({ now: 10_000 + i * 1000 }),
        }),
      )
      seen.add(next.anim)
      markIdleLoaded(loaded, next.anim, LIMIT)
      rt = { ...next, until: 0 } // 强制下一轮继续决策
    }
    return seen
  }

  it('额度用满后，被抽到的名字**全部**已在集合内（含漫游那一档）', () => {
    for (const wander of [false, true]) {
      const loaded = new Set<string>()
      pump(loaded, 60, wander)
      expect(loaded.size).toBe(LIMIT) // 额度用满

      const afterFull = pump(loaded, 80, wander)
      expect(afterFull.size).toBeGreaterThan(0)
      for (const n of afterFull) {
        expect(loaded.has(n), `到顶后不该出现未加载的名字：${n}（wander=${wander}）`).toBe(true)
      }
      expect(loaded.size).toBe(LIMIT) // 再跑 80 轮也不涨
    }
  })

  it('**上限不拦语义状态**：Agent 变 working 时照样切到该状态的动画', () => {
    const loaded = loadedOf(40) // 早已到顶
    const next = decide(
      cfg,
      idleRuntime(),
      ctxOf({ now: 5000, context: worldState({ agent: 'working' }), idleLoaded: loaded, idleLimit: LIMIT }),
    )
    expect(next.state).toBe('working')
    expect(cfg.animations.states.working).toContain(next.anim)
  })

  it('不传 idleLoaded 时行为与从前一致（上限是可选的注入）', () => {
    const loaded = new Set<string>()
    const rt = idleRuntime()
    const next = decide(cfg, rt, ctxOf({ now: 5000, roll: 0.95 }))
    expect(next.anim).toBeTruthy()
    expect(loaded.size).toBe(0) // 状态机自己不会记账 —— 记账是运行时的事
  })
})
