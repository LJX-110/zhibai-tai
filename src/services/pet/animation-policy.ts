/**
 * 桌宠 · **状态 → 动画策略**（纯函数，可单测；Step 4-3 · 七）
 *
 * ## 它补的是什么
 * 状态机直接 `pool[floor(roll * len)]` 抽动画，有两个问题：
 *  ① **同一个状态可能连着抽到同一个动作** —— `working` 的池里有"清点归档 / 忙碌点按"，
 *     纯随机也会连着出两遍，看上去像"卡住了"；
 *  ② 抽动画这件事没有**一处可以说清"什么状态优先什么动画"**的地方 ——
 *     语义映射散在 `decide` 里，改起来要读整个状态机。
 *
 * 于是把这一步单独抽出来，做成一条**有界**的策略链：
 * ```
 * 语义状态 ─► 候选池（配置里的 states.<state>）─► 池内选择（避开上一次）─► 动画名
 * ```
 *
 * ## 三条纪律（规格 §B4 / §B6）
 *  · **候选池由状态决定，随机只在池内** —— 绝不做"从全部素材里随便挑一个"。
 *    所以 `success` 一定出庆祝、`error` 一定出黑脸、`waiting` 一定出等待，
 *    概率不参与"发生什么"；
 *  · **短时间不重复**：池里不止一个时，先把上一次播过的剔掉再选。
 *    （池里只有一个时不硬凑 —— 宁可重复，也不能凭空消失或换成别的语义）；
 *  · **池缺失退到 idle**：配置校验已保证八个状态都有池，这里是第二道防线。
 *
 * ⚠️ 本模块不认识 React / DOM / store，也不读 `Math.random` ——
 * 掷骰值由调用方注入，因此"选了哪一个"能被确定化断言。
 */
import type { PetConfig } from './types'
import type { PetState } from './state'

/** 该状态的候选动画池（池缺失时退到 idle 池 —— 第二道防线，见文件头） */
export function animCandidates(cfg: PetConfig, state: PetState): string[] {
  const pool = cfg.animations.states[state]
  if (pool && pool.length > 0) return pool
  return cfg.animations.idle
}

/** 把掷骰值夹回 [0,1)，避免调用方传入 1 或负数时越界取到 undefined */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v <= 0) return 0
  if (v >= 1) return 0.999999
  return v
}

/**
 * 池内选一个：有多个候选时先把 `avoid` 剔掉（"短时间内不重复"的落点）。
 *
 * 剔完之后若为空（池里只有一个且正好等于 avoid），退回原池 ——
 * **宁可重复也不能没有动画**：桌宠最坏的一类失败是"某状态下凭空消失"。
 */
export function pickFromPool(pool: readonly string[], roll: number, avoid?: string): string {
  const all = pool.filter((n) => Boolean(n))
  if (all.length === 0) return ''
  const options = all.length > 1 && avoid ? all.filter((n) => n !== avoid) : all
  const usable = options.length > 0 ? options : all
  const idx = Math.min(usable.length - 1, Math.floor(clamp01(roll) * usable.length))
  return usable[idx]
}

/**
 * 状态进入时挑一个动画。
 *
 * @param avoid 上一次播过的动画名（同状态连续进入时用来避免重复）
 */
export function pickStateAnim(cfg: PetConfig, state: PetState, roll: number, avoid?: string): string {
  return pickFromPool(animCandidates(cfg, state), roll, avoid)
}

/**
 * **首屏要预热的动画**（Step 4-3 · 九）：待机池 + 点击回应池 + 「被拎起来」池。
 *
 * 为什么是这三个：它们对应"用户什么都没做""用户第一次戳它""用户第一次拖它"
 * 这三种**必然发生**的情形；其余状态（thinking / working / waiting / success / error / sleep）
 * 都由**真实状态驱动**，到那一刻再按需取 —— 没有提前拉下来的理由。
 *
 * 2026-10-07 追加拖动姿态：拖动是第一次交互就会用到的动作，不预热的话首次拖动
 * 要等素材下载完才换姿（配合 PetSprite 的"预载成功才上屏"门控，表现为拖着不动）。
 * 数量仍受 PetStage 的 `WARMUP_LIMIT`（8）约束，不会退回"全量预载"。
 *
 * 名单**从配置派生**，不写死素材名：写死的话改了 `config.json` 就会悄悄失配
 * （旧版 `PetStage` 就是一份硬编码名单）。
 */
export function warmupAnims(cfg: PetConfig): string[] {
  const dragging = cfg.animations.events.dragging.flatMap((s) => (typeof s === 'string' ? [s] : s))
  return [...new Set([...cfg.animations.idle, ...cfg.animations.clicks, ...dragging])].filter(Boolean)
}
