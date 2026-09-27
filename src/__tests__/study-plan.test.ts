/**
 * 选课规划：学分进度与公选分组（纯函数）
 *
 * 三条口径各有用例钉住 —— 它们都是"看起来显然、写错却不会报错"的地方：
 *  · **只数 `selected`**：候选与不可选不是"已获得"，混进来会让进度虚高；
 *  · **超额不倒扣**：`remaining` 用 `max(goal - selected, 0)` —— 负数会被读成"还欠"，
 *    与"已经选够了"正好相反；
 *  · **非法 credit 不计入**：一个 NaN 能把整页进度算废，且页面上看不出来。
 */
import { describe, expect, it } from 'vitest'
import { planProgress, publicGroupsOf } from '../services/study'
import type { CoursePlan } from '../types/entities'

/** 造条目：只写关心的字段，其余给安全默认 */
const plan = (over: Partial<CoursePlan>): CoursePlan => ({
  id: 'p1',
  kind: 'limited',
  title: '课程',
  status: 'candidate',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const GOALS = { limited: 8, public: 12, pe: 1 }

describe('planProgress：只数「已选」', () => {
  it('候选与不可选**不计入**已获得学分', () => {
    const items = [
      plan({ id: 'a', kind: 'limited', status: 'selected', credit: 2 }),
      plan({ id: 'b', kind: 'limited', status: 'candidate', credit: 3 }),
      plan({ id: 'c', kind: 'limited', status: 'unavailable', credit: 3 }),
    ]
    expect(planProgress(items, GOALS).byKind.limited.selected).toBe(2)
  })

  it('实际数据：公选 5 / 12，还差 7', () => {
    const items = [
      plan({ id: 'a', kind: 'public', group: '文化传承与安全教育', status: 'selected', credit: 1 }),
      plan({ id: 'b', kind: 'public', group: '科技思维与科学探索', status: 'selected', credit: 2 }),
      plan({ id: 'c', kind: 'public', group: '世界文明与国际视野', status: 'selected', credit: 2 }),
    ]
    const p = planProgress(items, GOALS).byKind.public
    expect(p.selected).toBe(5)
    expect(p.goal).toBe(12)
    expect(p.remaining).toBe(7)
    expect(p.reached).toBe(false)
  })
})

describe('planProgress：三个方向各自成账', () => {
  it('限选 / 公选 / 体育 互不串账，合计是三者之和', () => {
    const items = [
      plan({ id: 'a', kind: 'limited', status: 'selected', credit: 2 }),
      plan({ id: 'b', kind: 'public', status: 'selected', credit: 5 }),
      plan({ id: 'c', kind: 'pe', status: 'selected', credit: 1 }),
    ]
    const { byKind, total } = planProgress(items, GOALS)
    expect(byKind.limited.selected).toBe(2)
    expect(byKind.public.selected).toBe(5)
    expect(byKind.pe.selected).toBe(1)
    expect(total.selected).toBe(8)
    expect(total.goal).toBe(21)
    expect(total.remaining).toBe(13)
  })

  it('体育 1 / 1 → 已完成', () => {
    const items = [plan({ id: 'a', kind: 'pe', status: 'selected', credit: 1 })]
    expect(planProgress(items, GOALS).byKind.pe.reached).toBe(true)
  })
})

describe('planProgress：超额不倒扣', () => {
  it('公选 13 / 12 → remaining 为 0（不是 -1）', () => {
    const p = planProgress([plan({ kind: 'public', status: 'selected', credit: 13 })], GOALS).byKind
      .public
    expect(p.selected).toBe(13)
    expect(p.remaining).toBe(0)
    expect(p.reached).toBe(true)
  })

  it('合计同样按 max(0, …) 算', () => {
    const items = [
      plan({ id: 'a', kind: 'limited', status: 'selected', credit: 10 }),
      plan({ id: 'b', kind: 'public', status: 'selected', credit: 20 }),
      plan({ id: 'c', kind: 'pe', status: 'selected', credit: 1 }),
    ]
    expect(planProgress(items, GOALS).total.remaining).toBe(0)
  })
})

describe('planProgress：边界', () => {
  it('目标为 0 = 未设目标：不算达标，也不显示负数', () => {
    const p = planProgress([plan({ status: 'selected', credit: 2 })], {
      limited: 0,
      public: 0,
      pe: 0,
    }).byKind.limited
    expect(p.goal).toBe(0)
    expect(p.remaining).toBe(0)
    expect(p.reached).toBe(false)
  })

  it('空数据 → 全零、不抛错', () => {
    const { byKind, total } = planProgress([], GOALS)
    expect(byKind.limited.selected).toBe(0)
    expect(total.selected).toBe(0)
    expect(total.goal).toBe(21)
    expect(total.remaining).toBe(21)
  })

  it('**非法 credit 不计入**（NaN / 负数 / 缺省）', () => {
    const items = [
      plan({ id: 'a', status: 'selected', credit: Number.NaN }),
      plan({ id: 'b', status: 'selected', credit: -3 }),
      plan({ id: 'c', status: 'selected' }),
      plan({ id: 'd', status: 'selected', credit: 2 }),
    ]
    const p = planProgress(items, GOALS).byKind.limited
    expect(p.selected).toBe(2)
    expect(Number.isFinite(p.selected)).toBe(true)
  })

  it('目标非法（NaN / 负数）按 0 处理', () => {
    const p = planProgress([], { limited: Number.NaN, public: -5, pe: 1 }).byKind.limited
    expect(p.goal).toBe(0)
  })
})

describe('publicGroupsOf：公选分组', () => {
  it('按 group 分组，且**保持首次出现的顺序**（那是用户录入的顺序）', () => {
    const items = [
      plan({ id: 'a', kind: 'public', group: '世界文明与国际视野', title: '甲' }),
      plan({ id: 'b', kind: 'public', group: '文化传承与安全教育', title: '乙' }),
      plan({ id: 'c', kind: 'public', group: '世界文明与国际视野', title: '丙' }),
    ]
    const groups = publicGroupsOf(items)
    expect(groups.map((g) => g.group)).toEqual(['世界文明与国际视野', '文化传承与安全教育'])
    expect(groups[0].items.map((i) => i.title)).toEqual(['甲', '丙'])
  })

  it('只收公选 —— 限选 / 体育上的 group 不参与', () => {
    const items = [
      plan({ id: 'a', kind: 'limited', group: '（不该出现）' }),
      plan({ id: 'b', kind: 'pe' }),
      plan({ id: 'c', kind: 'public', group: '科技思维与科学探索' }),
    ]
    expect(publicGroupsOf(items).map((g) => g.group)).toEqual(['科技思维与科学探索'])
  })

  it('没填分组的**不进分组**（由调用方另行平铺，本函数不替用户决定归到哪一组）', () => {
    const items = [plan({ id: 'a', kind: 'public' }), plan({ id: 'b', kind: 'public', group: '  ' })]
    expect(publicGroupsOf(items)).toEqual([])
  })
})
