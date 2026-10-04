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
import {
  comparePlanItems,
  groupSuggestions,
  matchesQuery,
  movePlanItem,
  normalizeTags,
  planProgress,
  publicGroupsOf,
} from '../services/study-plan'
import { KIND_ORDER, KIND_SEAL, STATUS_LABEL, STATUS_SEAL } from '../pages/study/plan-shared'
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

describe('状态印章（A3 形制）：三个状态各有一枚可区分的圆印', () => {
  it('三个状态都有印章，单字互不相同', () => {
    const seals = Object.values(STATUS_SEAL)
    expect(seals).toHaveLength(3)
    expect(new Set(seals.map((s) => s.char)).size).toBe(3)
    for (const s of seals) expect(s.char).toHaveLength(1)
  })

  it('印章与状态字典一一对应（新增状态时漏配印章会在这里失败）', () => {
    expect(Object.keys(STATUS_SEAL).sort()).toEqual(Object.keys(STATUS_LABEL).sort())
  })

  it('低面积交给体系符箓保证：tone 取自 Seal 的闭集，且三态**颜色各不相同**', () => {
    const tones = Object.values(STATUS_SEAL).map((s) => s.tone)
    for (const t of tones) expect(['cinnabar', 'bronze', 'plain', 'teal']).toContain(t)
    // 三态同色 = "一眼看出状态"就没了（改回铺色块也不行 —— 那会抢标题焦点）
    expect(new Set(tones).size).toBe(3)
    // 最轻的一档留给"不可选"：它本该退到背景里
    expect(STATUS_SEAL.unavailable.tone).toBe('plain')
  })

  it('方向印章：三个方向齐备、单字、且**一律中性色**（颜色语义留给状态）', () => {
    expect(Object.keys(KIND_SEAL).sort()).toEqual([...KIND_ORDER].sort())
    for (const s of Object.values(KIND_SEAL)) {
      expect(s.char).toHaveLength(1)
      expect(s.tone).toBe('plain')
    }
  })

  it('**结构性守卫**：课程行必须用体系符箓，不得再手搓圆（防回退成楷体圆）', () => {
    const mods = import.meta.glob('../pages/study/CoursePlanRow.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const raw = Object.values(mods)[0] ?? ''
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // 两枚印都得走 Seal
    expect(code).toContain('<Seal')
    expect(code).toContain('STATUS_SEAL')
    expect(code).toContain('KIND_SEAL')
    // 手搓圆（rounded-full + border 的 span）是上一版的实现，禁止回退
    expect(code).not.toMatch(/rounded-full/)
  })
})

describe('选课列表口径（2026-10-02）：搜索 / 标签 / 二级分类建议', () => {
  it('matchesQuery：课名 / 教师 / 二级分类 / 标签 / 备注都命中，空查询恒真', () => {
    const item = plan({
      id: 'a',
      title: '金融学',
      teacher: '周明勇',
      group: '文化传承与安全教育',
      tags: ['专业课', '好过'],
      note: '周二下午',
    })
    expect(matchesQuery(item, '')).toBe(true)
    expect(matchesQuery(item, '   ')).toBe(true)
    expect(matchesQuery(item, '金融')).toBe(true)
    expect(matchesQuery(item, '周明勇')).toBe(true)
    expect(matchesQuery(item, '文化传承')).toBe(true)
    expect(matchesQuery(item, '好过')).toBe(true)
    expect(matchesQuery(item, '周二')).toBe(true)
    expect(matchesQuery(item, '英语')).toBe(false)
    // 大小写不敏感（英文标签）
    expect(matchesQuery(plan({ tags: ['AI'] }), 'ai')).toBe(true)
  })

  it('normalizeTags：按空白 / 中英文逗号 / 顿号切分、去重、去空（保序）', () => {
    expect(normalizeTags('专业课, 好过、双语  AI')).toEqual(['专业课', '好过', '双语', 'AI'])
    expect(normalizeTags('  ')).toEqual([])
    expect(normalizeTags('a，a, a')).toEqual(['a'])
  })

  it('groupSuggestions：只收同方向、去重、保持首次出现序（不做预设清单）', () => {
    const items = [
      plan({ id: 'a', kind: 'public', group: '文化传承' }),
      plan({ id: 'b', kind: 'limited', group: '限选自己的分类' }),
      plan({ id: 'c', kind: 'public', group: '文化传承' }),
      plan({ id: 'd', kind: 'public', group: '科技思维' }),
      plan({ id: 'e', kind: 'public' }),
      plan({ id: 'f', kind: 'public', group: '   ' }),
    ]
    expect(groupSuggestions(items, 'public')).toEqual(['文化传承', '科技思维'])
    expect(groupSuggestions(items, 'limited')).toEqual(['限选自己的分类'])
  })
})

describe('选课列表排序（2026-10-02）：comparePlanItems / movePlanItem', () => {
  it('排序键：方向 → 手动序（有先无后）→ 状态 → 课名', () => {
    const items = [
      plan({ id: 'a', kind: 'public', title: '乙', status: 'candidate' }),
      plan({ id: 'b', kind: 'limited', title: '甲', status: 'selected' }),
      plan({ id: 'c', kind: 'limited', title: '丙', status: 'candidate', order: 0 }),
      plan({ id: 'd', kind: 'limited', title: '乙', status: 'selected' }),
    ]
    const sorted = [...items].sort((x, y) => comparePlanItems(x, y))
    // 限选在前：c（手动序 0）→ b/d（无 order，按状态 已选 先）→ 公选最后
    expect(sorted.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a'])
  })

  it('movePlanItem：同方向内换位（物化后交换），跨方向不受影响', () => {
    const items = [
      plan({ id: 'a', kind: 'limited', title: '甲' }),
      plan({ id: 'b', kind: 'limited', title: '乙' }),
      plan({ id: 'c', kind: 'public', title: '丙' }),
    ]
    // 上移：默认顺序 [甲, 乙]，乙上移 → [乙, 甲]
    const moved = movePlanItem(items, 'b', -1)
    const order = [...moved]
      .filter((x) => x.kind === 'limited')
      .sort((x, y) => comparePlanItems(x, y))
      .map((x) => x.id)
    expect(order).toEqual(['b', 'a'])
    // 公选条目没被物化、也没被改
    expect(moved.find((x) => x.id === 'c')!.order).toBeUndefined()
    // 原数组未被就地修改（纯函数）
    expect(items.find((x) => x.id === 'a')!.order).toBeUndefined()
  })

  it('movePlanItem：边界（已在头 / 尾）原样返回', () => {
    const items = [
      plan({ id: 'a', kind: 'limited', title: '甲' }),
      plan({ id: 'b', kind: 'limited', title: '乙' }),
      plan({ id: 'c', kind: 'public', title: '丙' }),
    ]
    expect(movePlanItem(items, 'a', -1)).toEqual(items)
    expect(movePlanItem(items, 'c', 1)).toEqual(items)
  })

  it('movePlanItem：多条都没 order 时第一次点 ↑ 也有确定先后（物化）', () => {
    // 兜底按课名：甲(b) 在前；把 a 上移 → a 到最前
    const items = [plan({ id: 'a', title: '乙' }), plan({ id: 'b', title: '甲' })]
    const moved = movePlanItem(items, 'a', -1)
    const sorted = [...moved].sort((x, y) => comparePlanItems(x, y)).map((x) => x.id)
    expect(sorted).toEqual(['a', 'b'])
    // 物化：两行都带上了 order（否则下次比较仍然没有依据）
    expect(moved.every((x) => typeof x.order === 'number')).toBe(true)
  })
})
