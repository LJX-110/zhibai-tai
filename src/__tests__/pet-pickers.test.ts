/**
 * 桌宠 · 选择逻辑
 *
 * 贯穿这套算法的一条哲学：**宁可重复，也不要返回 undefined** ——
 * 桌宠循环里任何一次取不到动画名，表现都是"宠物凭空消失"（比重复播一遍严重得多）。
 * 所以"排除后池空"必须回退原池，这条逐项钉住。
 */
import { describe, expect, it } from 'vitest'
import { pick, pickCategoryAction, pickSlot, pickWeightedCategory, poolIncludes, randomBetween, rollKind } from '../services/pet/pickers'
import type { Category, Weights } from '../services/pet/types'

describe('pick：等概率抽，排除后回退', () => {
  it('单元素池即使排除自己也要返回它（不能返回 undefined）', () => {
    expect(pick(['只有这个'], '只有这个')).toBe('只有这个')
  })

  it('排除生效：池里只剩另一个时必得另一个', () => {
    expect(pick(['a', 'b'], 'a')).toBe('b')
  })

  it('空池不是本函数该处理的（调用方保证非空）—— 传空即得 undefined，这里记录契约', () => {
    expect(pick([] as string[])).toBeUndefined()
  })
})

describe('pickSlot：串原样、数组档内抽', () => {
  it('字符串槽位原样返回（固定播放）', () => {
    expect(pickSlot('固定动画')).toBe('固定动画')
  })

  it('数组槽位排除后空 → 退回原数组（单候选取自己也只能重复）', () => {
    expect(pickSlot(['唯一候选'], '唯一候选')).toBe('唯一候选')
  })

  it('数组槽位能避开 exclude', () => {
    expect(pickSlot(['a', 'b'], 'a')).toBe('b')
  })
})

describe('poolIncludes：数组槽位必须走它会判', () => {
  it('字符串命中与数组命中都算', () => {
    expect(poolIncludes(['甲', ['乙', '丙']], '甲')).toBe(true)
    expect(poolIncludes(['甲', ['乙', '丙']], '丙')).toBe(true)
    expect(poolIncludes(['甲', ['乙', '丙']], '丁')).toBe(false)
  })
})

describe('rollKind：权重掷骰', () => {
  const w: Weights = { idle: 10, turn: 5, move: 5 } // 剩余 80 归 action

  it('四档区间按权重切分（边界值取向：左闭右开）', () => {
    expect(rollKind(0, w)).toBe('idle')
    expect(rollKind(0.099, w)).toBe('idle')
    expect(rollKind(0.1, w)).toBe('turn')
    expect(rollKind(0.149, w)).toBe('turn')
    expect(rollKind(0.15, w)).toBe('move')
    expect(rollKind(0.199, w)).toBe('move')
    expect(rollKind(0.2, w)).toBe('action')
    expect(rollKind(0.999, w)).toBe('action')
  })

  it('权重全给 action 时不偏不倚走 action', () => {
    expect(rollKind(0, { idle: 0, turn: 0, move: 0 })).toBe('action')
  })
})

describe('pickWeightedCategory：noMirror 与归一化', () => {
  const cats: Category[] = [
    { id: '普通', weight: 1, actions: ['a'] },
    { id: '带字', weight: 1, noMirror: true, actions: ['b'] },
  ]

  it('朝右时排除 noMirror 分类（镜像会让文字颠倒）', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickWeightedCategory(cats, 'right')?.id).toBe('普通')
    }
  })

  it('朝左时两类都可能出现', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pickWeightedCategory(cats, 'left')!.id)
    expect(seen.size).toBe(2)
  })

  it('排除后为空则退回全部（不返回 null）', () => {
    const only: Category[] = [{ id: '只有带字', weight: 1, noMirror: true, actions: ['b'] }]
    expect(pickWeightedCategory(only, 'right')?.id).toBe('只有带字')
  })

  it('空动作的分类不参与；全空才返回 null', () => {
    expect(pickWeightedCategory([{ id: '空', weight: 5, actions: [] }], 'left')).toBeNull()
  })
})

describe('pickCategoryAction：无分类时回退 idle 池', () => {
  it('分类池为空 → 回退 idle 而不是返回空动画名', () => {
    const r = pickCategoryAction([], ['待机甲', '待机乙'], 'left', '')
    expect(r.id).toBe('FALLBACK')
    expect(['待机甲', '待机乙']).toContain(r.name)
  })

  it('有分类时从该分类的动作里抽', () => {
    const cats: Category[] = [{ id: 'c1', weight: 1, actions: ['动作甲'] }]
    expect(pickCategoryAction(cats, ['待机'], 'left', '').name).toBe('动作甲')
  })
})

describe('randomBetween：左闭右开', () => {
  it('恒落在 [min, max)', () => {
    for (let i = 0; i < 100; i++) {
      const v = randomBetween(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThan(7)
    }
  })

  it('区间为 1 时只能取到 min', () => {
    expect(randomBetween(5, 6)).toBe(5)
  })
})
