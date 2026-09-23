/**
 * 桌宠 · 配置加载与校验
 *
 * 两条刻意为之的取舍：
 *  1. **校验是纯函数**（`validatePetConfig`）—— 可以脱离网络单测，也能在别处复用；
 *  2. **缺失 / 非法一律显式 throw，绝不静默兜底**。
 *     桌宠是常驻渲染物：配置错了若悄悄回退到内置默认值，表现是"宠物行为诡异但没人知道为什么"。
 *     抛出去由上层 `recordError` 记进故障流水 + 停掉桌宠，问题立刻可见（见 `编码规范.md` 第 8 节）。
 */
import type { Category, PetConfig, Weights } from './types'

/** 配置路径：走相对路径，GitHub Pages 子路径部署下同样可用（仅本文件用） */
const PET_CONFIG_URL = `${import.meta.env.BASE_URL}pet/config.json`

/** 素材 URL：`public/pet/<动画名>.webp` */
export function petAssetUrl(name: string): string {
  return `${import.meta.env.BASE_URL}pet/${encodeURIComponent(name)}.webp`
}

class ConfigError extends Error {
  constructor(msg: string) {
    super(`桌宠配置有误：${msg}`)
    this.name = 'PetConfigError'
  }
}

function needStringArray(v: unknown, path: string): string[] {
  if (!Array.isArray(v) || v.length === 0) throw new ConfigError(`${path} 必须是非空字符串数组`)
  for (const x of v) if (typeof x !== 'string' || !x.trim()) throw new ConfigError(`${path} 含非法项（须为非空字符串）`)
  return v as string[]
}

function needNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ConfigError(`${path} 必须是有限数字`)
  return v
}

function needWeights(v: unknown): Weights {
  if (!v || typeof v !== 'object') throw new ConfigError('weights 缺失')
  const o = v as Record<string, unknown>
  const w = { idle: needNumber(o.idle, 'weights.idle'), turn: needNumber(o.turn, 'weights.turn'), move: needNumber(o.move, 'weights.move') }
  if (w.idle < 0 || w.turn < 0 || w.move < 0) throw new ConfigError('weights 不能为负')
  // 三档之和超过 100 会让最后一档永远轮不到，属于配置错误而不是"可容忍的偏差"
  if (w.idle + w.turn + w.move > 100) throw new ConfigError('weights 三档之和不能超过 100（剩余概率归入 action）')
  return w
}

function needCategories(v: unknown): Category[] {
  if (!Array.isArray(v)) throw new ConfigError('animations.categories 必须是数组')
  return v.map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>
    if (typeof o.id !== 'string' || !o.id.trim()) throw new ConfigError(`categories[${i}].id 缺失`)
    const weight = needNumber(o.weight, `categories[${i}].weight`)
    if (weight <= 0) throw new ConfigError(`categories[${i}].weight 必须为正（否则该分类永远不会被选中）`)
    return { id: o.id, weight, noMirror: o.noMirror === true, actions: needStringArray(o.actions, `categories[${i}].actions`) }
  })
}

/** 校验并规范化原始配置（纯函数；非法即抛，不返回"修好的"配置） */
export function validatePetConfig(raw: unknown): PetConfig {
  if (!raw || typeof raw !== 'object') throw new ConfigError('根节点不是对象')
  const r = raw as Record<string, unknown>

  if (typeof r.name !== 'string' || !r.name.trim()) throw new ConfigError('name 缺失')
  const size = needNumber(r.size, 'size')
  if (size <= 0) throw new ConfigError('size 必须为正')

  const pos = (r.position ?? {}) as Record<string, unknown>
  const corner = pos.corner
  if (corner !== 'top-left' && corner !== 'top-right' && corner !== 'bottom-left' && corner !== 'bottom-right') {
    throw new ConfigError('position.corner 必须是 top-left / top-right / bottom-left / bottom-right 之一')
  }

  const tick = (r.tickMs ?? {}) as Record<string, unknown>
  const tickMin = needNumber(tick.min, 'tickMs.min')
  const tickMax = needNumber(tick.max, 'tickMs.max')
  if (tickMin <= 0 || tickMax < tickMin) throw new ConfigError('tickMs 区间非法（须 0 < min ≤ max）')

  const anim = (r.animations ?? {}) as Record<string, unknown>
  const events = (anim.events ?? {}) as Record<string, unknown>
  const eventsNorm: Record<string, (string | string[])[]> = {}
  for (const [k, v] of Object.entries(events)) {
    if (!Array.isArray(v) || v.length === 0) throw new ConfigError(`animations.events.${k} 必须是非空数组`)
    eventsNorm[k] = v.map((slot, i) => {
      if (typeof slot === 'string') return slot
      if (Array.isArray(slot) && slot.length > 0 && slot.every((s) => typeof s === 'string')) return slot as string[]
      throw new ConfigError(`animations.events.${k}[${i}] 必须是动画名或动画名数组`)
    })
  }

  const movesRaw = (anim.moves ?? {}) as Record<string, unknown>
  const moveActions = Array.isArray(movesRaw.actions)
    ? movesRaw.actions.map((a, i) => {
        const o = (a ?? {}) as Record<string, unknown>
        if (typeof o.name !== 'string' || !o.name.trim()) throw new ConfigError(`animations.moves.actions[${i}].name 缺失`)
        return { name: o.name, params: (o.params ?? undefined) as Record<string, number> | undefined }
      })
    : []

  const phys = (r.physics ?? {}) as Record<string, unknown>

  return {
    name: r.name,
    size,
    position: {
      corner,
      marginX: needNumber(pos.marginX, 'position.marginX'),
      marginY: needNumber(pos.marginY, 'position.marginY'),
    },
    tickMs: { min: tickMin, max: tickMax },
    animations: {
      idle: needStringArray(anim.idle, 'animations.idle'),
      turn: needStringArray(anim.turn, 'animations.turn'),
      clicks: needStringArray(anim.clicks, 'animations.clicks'),
      moves: { default: (movesRaw.default ?? {}) as Record<string, number>, actions: moveActions },
      categories: needCategories(anim.categories),
      events: eventsNorm,
    },
    weights: needWeights(r.weights),
    physics: {
      gravity: needNumber(phys.gravity, 'physics.gravity'),
      restitution: needNumber(phys.restitution, 'physics.restitution'),
      groundFriction: needNumber(phys.groundFriction, 'physics.groundFriction'),
      throwPower: needNumber(phys.throwPower, 'physics.throwPower'),
    },
  }
}

/** 拉取并校验配置；失败显式抛（调用方负责 recordError + 停用桌宠） */
export async function loadPetConfig(signal?: AbortSignal): Promise<PetConfig> {
  const res = await fetch(PET_CONFIG_URL, { signal })
  if (!res.ok) throw new ConfigError(`拉取 ${PET_CONFIG_URL} 失败（HTTP ${res.status}）`)
  return validatePetConfig(await res.json())
}
