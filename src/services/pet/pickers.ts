/**
 * 桌宠 · 纯选择逻辑（无 React / DOM 依赖，可独立单测）
 *
 * 算法移植自参考项目的 `shared/pickers.ts`，去掉其 DSH 依赖后原样保留语义。
 * 这里有一条贯穿始终的哲学：**宁可重复，也不要返回 undefined** ——
 * 排除后池空（单元素池 + 排除自己）时退回原池。桌宠循环里任何一次取不到动画名，
 * 表现都是"宠物凭空消失"，比重复播一遍严重得多。
 */
import type { Category, EventSlot, Weights } from './types'

/** 从字符串池等概率抽一个；`exclude` 排除某个名字（避免连续重复） */
export function pick<T>(pool: T[], exclude?: T): T {
  const entries = exclude === undefined ? pool : pool.filter((n) => n !== exclude)
  // 排除后池空 → 退回原池：宁可重复，也不要返回 undefined
  const src = entries.length ? entries : pool
  return src[Math.floor(Math.random() * src.length)]
}

/** 事件档位取值：字符串槽位原样返回；数组槽位档内随机抽 1 并尽量避开 `exclude` */
export function pickSlot(slot: EventSlot, exclude?: string): string {
  if (typeof slot === 'string') return slot
  const entries = exclude === undefined ? slot : slot.filter((n) => n !== exclude)
  const src = entries.length ? entries : slot
  return src[Math.floor(Math.random() * src.length)]
}

/** 槽位是否包含某动画名（数组槽位必须走这里，直接 includes 会漏判）—— 仅内部使用 */
function slotIncludes(slot: EventSlot, anim: string): boolean {
  return typeof slot === 'string' ? slot === anim : slot.includes(anim)
}

/** 某个事件池（档位数组）是否包含某动画名 */
export function poolIncludes(pool: readonly EventSlot[], anim: string): boolean {
  return pool.some((slot) => slotIncludes(slot, anim))
}

/** 生成 `[min, max)` 区间内的随机整数 */
export function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min))
}

/**
 * 按权重在分类池中选一个分类。
 * `noMirror` 的分类在朝右时被排除，剩余权重**自动归一化**；
 * 若排除后为空则退回全部（同样不为 null）——分类池本身为空才返回 null。
 */
export function pickWeightedCategory(categories: Category[], facing: 'left' | 'right'): Category | null {
  const cats = categories.filter((c) => c.actions.length > 0)
  if (!cats.length) return null
  const filtered = cats.filter((c) => !(c.noMirror && facing === 'right'))
  const eligible = filtered.length ? filtered : cats
  const totalW = eligible.reduce((s, c) => s + c.weight, 0) || 1
  let t = Math.random() * totalW
  for (const c of eligible) {
    t -= c.weight
    if (t <= 0) return c
  }
  return eligible[eligible.length - 1]
}

/** 掷骰结果类别 */
export type RollKind = 'idle' | 'turn' | 'move' | 'action'

/**
 * 按权重掷骰：`roll ∈ [0,1)` → 下一个动画类别（纯函数，可单测）。
 * 前三档占比之和之后的剩余概率全部归入 `action`。
 */
export function rollKind(roll: number, w: Weights): RollKind {
  if (roll < w.idle / 100) return 'idle'
  if (roll < (w.idle + w.turn) / 100) return 'turn'
  if (roll < (w.idle + w.turn + w.move) / 100) return 'move'
  return 'action'
}

/** 从分类池选一个动作；无可用分类时**回退 idle 池**（而不是返回空） */
export function pickCategoryAction(
  categories: Category[],
  idlePool: string[],
  facing: 'left' | 'right',
  current: string,
): { id: string; name: string } {
  const cat = pickWeightedCategory(categories, facing)
  if (!cat) return { id: 'FALLBACK', name: pick(idlePool, current) }
  return { id: cat.id, name: pick(cat.actions, current) }
}
