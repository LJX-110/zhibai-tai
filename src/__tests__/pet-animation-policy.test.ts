/**
 * 桌宠 · 状态 → 动画策略（Step 4-3 · 七）
 *
 * 这组用例钉住"随机只能用在同一个状态内部"这条纪律：
 *  · 候选池**由语义状态决定**（`success` 必庆祝、`error` 必黑脸、`waiting` 必等待）；
 *  · 池内选择**避开上一次**（同一状态反复进入不会卡在同一帧）；
 *  · 池里只有一个时**不硬凑**（宁可重复，也不能没有动画 —— 那会让宠物凭空消失）；
 *  · 掷骰值越界不产生 undefined。
 */
import { describe, expect, it } from 'vitest'
import { animCandidates, pickFromPool, pickStateAnim, warmupAnims } from '../services/pet/animation-policy'
import { PET_STATES, type PetState } from '../services/pet/state'
import { validatePetConfig, petAssetUrl } from '../services/pet/config'
import rawConfig from '../../public/pet/config.json?raw'
import type { PetConfig } from '../services/pet/types'

const cfg: PetConfig = {
  name: '知白',
  size: 160,
  position: { corner: 'bottom-right', marginX: 12, marginY: 96 },
  tickMs: { min: 4000, max: 9000 },
  animations: {
    idle: ['待机'],
    turn: ['张望'],
    clicks: ['回应甲', '回应乙'],
    moves: { default: {}, actions: [{ name: '走' }] },
    categories: [{ id: 'c', weight: 80, actions: ['小动作'] }],
    events: { dragging: ['被拎起来'] },
    states: {
      idle: ['待机'],
      thinking: ['思考'],
      working: ['清点', '点按'],
      waiting: ['踱步'],
      success: ['庆祝'],
      error: ['垂头'],
      focused: ['记录', '写码'],
      sleep: ['小憩'],
    },
  },
  weights: { idle: 10, turn: 5, move: 5 },
  reserve: { 备用甲: '留着以后用' },
}

/** 真实配置（策略链必须在真素材上同样成立） */
const real = validatePetConfig(JSON.parse(rawConfig) as unknown)

describe('候选池由语义状态决定（随机不参与"发生什么"）', () => {
  it('每个状态拿到的是它自己的池', () => {
    expect(animCandidates(cfg, 'success')).toEqual(['庆祝'])
    expect(animCandidates(cfg, 'error')).toEqual(['垂头'])
    expect(animCandidates(cfg, 'waiting')).toEqual(['踱步'])
    expect(animCandidates(cfg, 'sleep')).toEqual(['小憩'])
  })

  it('池缺失 → 退到 idle 池（第二道防线，绝不让宠物没有动画）', () => {
    const broken = { ...cfg, animations: { ...cfg.animations, states: { ...cfg.animations.states, error: [] } } }
    expect(animCandidates(broken, 'error')).toEqual(['待机'])
  })

  it('random 只能挑"池内"的名字 —— 拿不到别的状态的动画', () => {
    for (const s of PET_STATES) {
      const pool = animCandidates(cfg, s)
      for (const roll of [0, 0.25, 0.5, 0.99]) {
        expect(pool).toContain(pickStateAnim(cfg, s, roll))
      }
    }
  })
})

describe('池内选择：短时间不重复', () => {
  it('池里有两个时，第二次会避开第一次播过的那个', () => {
    const first = pickStateAnim(cfg, 'working', 0.99)
    const second = pickStateAnim(cfg, 'working', 0.99, first)
    expect(first).not.toBe(second)
    expect(['清点', '点按']).toContain(second)
  })

  it('池里只有一个 → 不硬凑，仍返回它（宁可重复也不能没动画）', () => {
    expect(pickStateAnim(cfg, 'error', 0.99, '垂头')).toBe('垂头')
  })

  it('avoid 不在池里时不受影响', () => {
    expect(pickStateAnim(cfg, 'focused', 0, '待机')).toBe('记录')
  })
})

describe('掷骰值越界不产生 undefined', () => {
  it('0 / 1 / 负数 / NaN 都落在池内', () => {
    const pool = animCandidates(cfg, 'focused')
    for (const roll of [0, 1, 1.5, -3, Number.NaN]) {
      expect(pool).toContain(pickStateAnim(cfg, 'focused', roll))
    }
  })

  it('pickFromPool 对空池返回空串（调用方会走"池缺失退 idle"那条）', () => {
    expect(pickFromPool([], 0.5)).toBe('')
  })
})

describe('真实配置：策略链在真素材上同样成立', () => {
  it('八个语义状态都有非空池', () => {
    for (const s of PET_STATES) expect(animCandidates(real, s).length).toBeGreaterThan(0)
  })

  it('success / error / waiting / sleep 的池就是各自的语义动画（不混进待机）', () => {
    expect(animCandidates(real, 'success').join()).toContain('雀跃')
    expect(animCandidates(real, 'error').join()).toContain('垂头')
    expect(animCandidates(real, 'sleep').join()).toContain('小憩')
    expect(animCandidates(real, 'idle').join()).toContain('待机')
  })
})

describe('首屏预热名单（Step 4-3 · 九）', () => {
  it('只含待机池与点击应答池，且已去重', () => {
    expect(warmupAnims(cfg)).toEqual(['待机', '回应甲', '回应乙'])
  })

  it('**不包含任何"按需状态"的素材**（thinking / working / waiting / success / error / sleep）', () => {
    const warm = new Set(warmupAnims(cfg))
    for (const s of ['thinking', 'working', 'waiting', 'success', 'error', 'focused', 'sleep'] as PetState[]) {
      for (const name of animCandidates(cfg, s)) expect(warm.has(name)).toBe(false)
    }
  })

  it('**不包含 reserve 登记的素材**（登记 = 留着不删，不是"提前拉下来"）', () => {
    const warm = new Set(warmupAnims(real))
    for (const name of Object.keys(real.reserve ?? {})) expect(warm.has(name)).toBe(false)
  })

  it('真实配置下首屏名单有界（不随素材总数增长）', () => {
    const warm = warmupAnims(real)
    expect(warm.length).toBeGreaterThan(0)
    // 当前是 1 张待机 + 5 张点击应答；上限设 8 是为了给"以后多几张待机"留余量，
    // 真正的护栏是下面那条"远小于素材总数"
    expect(warm.length).toBeLessThanOrEqual(8)
  })

  it('素材 URL 是"一次一个"的纯函数（不产生通配、不依赖别的素材）', () => {
    const a = petAssetUrl('待机呼吸休闲')
    // URL 里的中文经过 encodeURIComponent（部署路径安全），解码回来必须还是这个名字
    expect(decodeURIComponent(a)).toContain('待机呼吸休闲')
    expect(a).not.toContain('*')
    // 同一个名字永远得到同一个 URL（纯函数），换名字只换最后一段
    expect(petAssetUrl('待机呼吸休闲')).toBe(a)
    expect(petAssetUrl('东张西望')).not.toBe(a)
  })
})
