/**
 * 桌宠 · idle 闲暇素材的**会话上限**（Step 5-1 · E1）
 *
 * ## 为什么要有它
 * idle 能抽到的闲暇素材共 82 张 / 约 49MB（小动作 / 玩耍 / 吃什么 / 时节 / 文字 /
 * 转向 / 漫游）。它们**逐张按需加载**（换动画 = 换一个 `<img src>`），
 * 所以长时间挂着会一张张累积上去 —— 单张约 600KB，看不到尽头。
 *
 * 产品决定：**不删素材**（那 82 张是"待机时更自由的表演"的内容本体），
 * 改成"**每个应用会话最多加载 20 个不同的 idle 素材**"，到顶之后只从已加载过的那批里挑。
 *
 * ## 三条不能破的约束（都在代码里兜住，不靠自觉）
 *  1. **绝不拦 `resolveAsset`**：拦截点若放在"名字 → URL"那一层，
 *     会出现"想播的动画播不出来"= **静默定帧**，那是桌宠最坏的一类失败。
 *     所以上限只作用在**选哪个动画**这一步（`state-machine.decide` 的 idle 分支）；
 *  2. **池不能空**：收敛后若一个都没剩，一律**退回原池** —— 宁可多下一次，也不能没有动画；
 *  3. **只算 idle 闲暇**：`thinking / working / waiting / success / error / focused / sleep`
 *     与点击应答**不受这个上限约束**（它们是状态驱动的必备表现，不是闲暇）。
 *
 * ## 为什么是纯函数 + 注入
 * `loaded` 由运行时（`usePetLoop`）持有、作为**只读视图**注入 `DecideContext`；
 * 本模块只做"给定已加载集合，这次允许从哪些名字里挑"。于是上限行为可以确定化单测，
 * 而 `state-machine` 保持纯函数（与 `ctx.roll` / `ctx.rand` 同一套注入先例）。
 */
import type { Category, PetConfig } from './types'

/** 每个应用会话最多加载多少个**不同**的 idle 闲暇素材 */
export const IDLE_SESSION_LIMIT = 20

/** 已加载过的 idle 素材（运行时持有的集合；undefined = 不限制，供旧的调用点/单测使用） */
export type IdleLoaded = ReadonlySet<string>

/** 还有"下载新素材"的额度吗 */
export function canLoadMoreIdle(loaded: IdleLoaded, limit = IDLE_SESSION_LIMIT): boolean {
  return loaded.size < limit
}

/**
 * 把候选池收敛到"本次允许挑的范围"。
 *
 * · `loaded` 未给（undefined）→ 原样返回（不限制）；
 * · 还有额度 → 原样返回（允许出现新名字，即允许一次新的下载）；
 * · 已到上限 → 只保留**已加载过**的名字；
 * · 收敛后为空 → 先用 `fallback`（**已收敛过的别的池**，如 idle）里的已加载名字顶上；
 *   连它也没有 → 退回原池（宁可多下载一次，也不能让池空 —— 空池 = 宠物定帧/消失）。
 *
 * ⚠️ `fallback` 是 Step 5-3E 加的：把 turn / move 这类**小池**（1~3 个名字）
 * 在到顶后容易整池落空 —— 那时退回原池会引入新下载，与"到顶后不再有新名字"冲突。
 */
export function idlePoolWithin(
  pool: readonly string[],
  loaded: IdleLoaded | undefined,
  limit = IDLE_SESSION_LIMIT,
  fallback?: readonly string[],
): string[] {
  const all = pool.filter(Boolean)
  if (!loaded || all.length === 0) return all
  if (canLoadMoreIdle(loaded, limit)) return all
  const loadedOnly = all.filter((n) => loaded.has(n))
  if (loadedOnly.length > 0) return loadedOnly
  const fallbackLoaded = (fallback ?? []).filter((n) => loaded.has(n))
  return fallbackLoaded.length > 0 ? fallbackLoaded : all
}

/**
 * 分类池的同款收敛（每个分类各自过滤，空分类剔除；全空则退回原分类池）。
 *
 * ⚠️ 额度未满时**返回原引用**（不拷贝）：本函数在每次 idle 决策都会被调用，
 * 无谓的 `[...categories].map(...)` 会在长挂场景里持续产生垃圾对象。
 * 只有"闸门关闭、真的需要过滤"时才新建。
 */
export function categoriesWithin(
  categories: Category[],
  loaded: IdleLoaded | undefined,
  limit = IDLE_SESSION_LIMIT,
): Category[] {
  if (!loaded || categories.length === 0) return categories
  if (canLoadMoreIdle(loaded, limit)) return categories
  const bounded = categories
    .map((c) => ({ ...c, actions: c.actions.filter((n) => loaded.has(n)) }))
    .filter((c) => c.actions.length > 0)
  return bounded.length > 0 ? bounded : categories
}

/**
 * idel 闲暇池的全集（判断一个名字是否属于"该计入上限"的那几类）。
 * 刻意**不含** clicks 与 states：点击应答与语义状态动画是必备表现，不该被限额挤掉。
 */
export function idleEraNames(cfg: PetConfig): Set<string> {
  const set = new Set<string>()
  for (const n of cfg.animations.idle) set.add(n)
  for (const n of cfg.animations.turn) set.add(n)
  for (const a of cfg.animations.moves.actions) set.add(a.name)
  for (const c of cfg.animations.categories) for (const n of c.actions) set.add(n)
  set.delete('')
  return set
}

/**
 * 记录一个"这次真的会去加载"的 idle 素材。
 * @returns 是否**新增**（false = 已加载过，或已到上限所以不记）
 */
export function markIdleLoaded(
  loaded: Set<string>,
  name: string,
  limit = IDLE_SESSION_LIMIT,
): boolean {
  if (!name || loaded.has(name)) return false
  if (!canLoadMoreIdle(loaded, limit)) return false
  loaded.add(name)
  return true
}
