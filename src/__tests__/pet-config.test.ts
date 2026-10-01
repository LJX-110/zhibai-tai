/**
 * 桌宠 · 配置校验
 *
 * 校验的立场是**显式失败，绝不静默兜底**：桌宠是常驻渲染物，
 * 配置错了若悄悄回退到内置默认值，表现是"宠物行为诡异但没人知道为什么"。
 * 所以下面每条非法配置都断言**抛错**，而不是断言"被修正成什么"。
 *
 * 最后一条用**真实配置文件**跑一遍：配置与素材名对不上时（改名、漏转素材）
 * 宠物会显示空白，这类问题必须在测试里就拦住。
 */
import { describe, expect, it } from 'vitest'
import { validatePetConfig } from '../services/pet/config'
import { PET_STATES } from '../services/pet/state'
// 走 Vite 的 `?raw` 而不是 node:fs —— app 侧的 tsconfig 不含 node 类型，
// 而 `?raw` 由 vite/client 提供声明，浏览器与测试两侧都能用
import rawConfig from '../../public/pet/config.json?raw'

/** 八个语义状态各给一个池（缺一个都会让宠物在某状态下"无动画可播"） */
const states = Object.fromEntries(PET_STATES.map((s) => [s, [`${s}动画`]]))

/**
 * 素材目录里的全部动画名（不含扩展名）。
 * 用 Vite 的 glob 而不是 node:fs —— 与 `?raw` 同一个理由：
 * app 侧 tsconfig 不含 node 类型，glob 由 vite/client 提供声明。
 */
const assetModules = import.meta.glob('../../public/pet/*.webp')
function assetNames(): string[] {
  return Object.keys(assetModules).map((p) => p.split('/').pop()!.replace(/\.webp$/, ''))
}

const good = {
  name: '知白',
  size: 160,
  position: { corner: 'bottom-right', marginX: 12, marginY: 96 },
  tickMs: { min: 4000, max: 9000 },
  animations: {
    idle: ['待机'],
    turn: ['东张西望'],
    clicks: ['应甲'],
    moves: { default: {}, actions: [{ name: '走甲' }] },
    categories: [{ id: 'c1', weight: 80, actions: ['动作甲'] }],
    events: { dragging: ['被拎起来'] },
    states,
  },
  weights: { idle: 10, turn: 5, move: 5 },
}

const withPatch = (patch: Record<string, unknown>) => ({ ...good, ...patch })

describe('validatePetConfig：合法配置通过', () => {
  it('返回规范化后的配置（字段齐备）', () => {
    const c = validatePetConfig(good)
    expect(c.name).toBe('知白')
    expect(c.animations.idle).toEqual(['待机'])
    expect(c.weights).toEqual({ idle: 10, turn: 5, move: 5 })
  })

  it('事件槽位支持「单名」与「候选数组」两种写法', () => {
    const c = validatePetConfig(
      withPatch({
        animations: { ...good.animations, events: { busy: ['固定'], other: [['甲', '乙']] } },
      }),
    )
    expect(c.animations.events.busy).toEqual(['固定'])
    expect(c.animations.events.other).toEqual([['甲', '乙']])
  })
})

describe('validatePetConfig：非法配置一律抛错', () => {
  const patchAnim = (patch: Record<string, unknown>) => withPatch({ animations: { ...good.animations, ...patch } })

  const cases: [string, unknown][] = [
    ['根不是对象', null],
    ['name 缺失', withPatch({ name: '' })],
    ['size 非数字', withPatch({ size: 'big' })],
    ['size 非正', withPatch({ size: 0 })],
    ['corner 非法', withPatch({ position: { corner: 'middle', marginX: 0, marginY: 0 } })],
    ['tickMs 区间倒置', withPatch({ tickMs: { min: 9000, max: 4000 } })],
    ['idle 空数组', patchAnim({ idle: [] })],
    ['idle 含非字符串', patchAnim({ idle: [1] })],
    ['分类 id 缺失', patchAnim({ categories: [{ weight: 1, actions: ['a'] }] })],
    ['分类权重为 0（该分类永不选中）', patchAnim({ categories: [{ id: 'x', weight: 0, actions: ['a'] }] })],
    ['分类动作空', patchAnim({ categories: [{ id: 'x', weight: 1, actions: [] }] })],
    ['事件池为空', patchAnim({ events: { dragging: [] } })],
    ['事件槽位类型非法', patchAnim({ events: { dragging: [123] } })],
    ['权重为负', withPatch({ weights: { idle: -1, turn: 5, move: 5 } })],
    ['权重三档之和超 100（末档永远轮不到）', withPatch({ weights: { idle: 60, turn: 30, move: 20 } })],
    ['states 整段缺失（语义状态没有动画 = 宠物会凭空消失）', patchAnim({ states: undefined })],
    ['states 缺了一个核心状态', patchAnim({ states: { ...states, error: undefined } })],
    ['states 里某个池为空', patchAnim({ states: { ...states, working: [] } })],
    ['reserve 的说明为空', withPatch({ reserve: { 素材甲: '  ' } })],
  ]
  for (const [label, raw] of cases) {
    it(label, () => {
      expect(() => validatePetConfig(raw)).toThrow(/桌宠配置有误/)
    })
  }

  it('错误信息带上具体路径（便于定位是哪个字段错了）', () => {
    expect(() => validatePetConfig(withPatch({ weights: { idle: 60, turn: 30, move: 20 } }))).toThrow(/weights/)
  })
})

describe('真实配置文件 public/pet/config.json', () => {
  const raw = JSON.parse(rawConfig) as unknown

  it('校验通过（配置与代码两侧结构一致）', () => {
    expect(() => validatePetConfig(raw)).not.toThrow()
  })

  it('**每个语义状态都有动画池**（与 PET_STATES 清单对齐，缺一个就红）', () => {
    const c = validatePetConfig(raw)
    for (const s of PET_STATES) {
      expect(c.animations.states[s]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('引用的每个动画名都非空（不做素材存在性检查 —— 那要靠构建期脚本）', () => {
    const c = validatePetConfig(raw)
    const all = [
      ...c.animations.idle,
      ...c.animations.turn,
      ...c.animations.clicks,
      ...c.animations.moves.actions.map((a) => a.name),
      ...c.animations.categories.flatMap((x) => x.actions),
      ...Object.values(c.animations.events).flatMap((pool) => pool.flatMap((s) => (typeof s === 'string' ? [s] : s))),
      ...Object.values(c.animations.states).flat(),
    ]
    expect(all.length).toBeGreaterThan(50)
    expect(all.every((n) => n.trim().length > 0)).toBe(true)
  })

  it('**每个素材都有归宿**：要么被某个池引用，要么登记在 reserve（不许有孤儿文件）', () => {
    const c = validatePetConfig(raw)
    const used = new Set([
      ...c.animations.idle,
      ...c.animations.turn,
      ...c.animations.clicks,
      ...c.animations.moves.actions.map((a) => a.name),
      ...c.animations.categories.flatMap((x) => x.actions),
      ...Object.values(c.animations.events).flatMap((pool) => pool.flatMap((s) => (typeof s === 'string' ? [s] : s))),
      ...Object.values(c.animations.states).flat(),
    ])
    const reserved = new Set(Object.keys(c.reserve ?? {}))
    const files = assetNames()
    expect(files.length).toBeGreaterThan(100)

    // ① 引用的动画名必须真有素材（改名 / 漏转素材 → 宠物显示空白且不报错）
    for (const name of used) expect(files).toContain(name)
    // ② 登记在 reserve 的素材也必须真存在（登记不能凭空写）
    for (const name of reserved) expect(files).toContain(name)
    // ③ 孤儿检查：既没接线、也没登记的素材 = 忘了归置（Step 4-2 · B5 的"14 个未使用"）
    const orphans = files.filter((f) => !used.has(f) && !reserved.has(f))
    expect(orphans).toEqual([])
  })

  it('至少有一个分类带 noMirror（带文字的动画不能被镜像）', () => {
    const c = validatePetConfig(raw)
    expect(c.animations.categories.some((x) => x.noMirror)).toBe(true)
  })
})
