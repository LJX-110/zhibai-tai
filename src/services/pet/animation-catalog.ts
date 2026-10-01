/**
 * 桌宠 · 动作目录（纯函数，Step 5-3E）
 *
 * ## 它解决的问题
 * 设置页要列一张「动作名」清单，点一个就让桌宠播一个。清单必须来自
 * `public/pet/config.json`（**代码里不写死任何素材名** —— 这是桌宠的既有纪律），
 * 于是把"摊平 + 分组 + 去重 + 校验"收在这一处。
 *
 * ## 两个用途
 *  · 设置页「动作」列表：`animationCatalog(cfg)` → 分组渲染；
 *  · 播放命令的**白名单**：`findPlayable(cfg, name)` → 名字不在配置里就返回 null
 *    （设置页可能拿着旧配置缓存发命令，宠物侧不信任调用方）。
 */
import type { PetConfig } from './types'

export interface AnimationGroup {
  /** 分组名（展示用）：待机 / 转向 / 点击回应 / 移动 / 各分类 id / 状态演出 */
  group: string
  names: string[]
}

/** 组内去重（保序） */
function uniq(names: string[]): string[] {
  return [...new Set(names)]
}

/**
 * 把配置里**所有可播的动画名**摊平成"分组 → 名字"。
 * 顺序即观感顺序：先日常（待机 / 转向 / 点击 / 移动），再各分类小动作，最后状态演出。
 */
export function animationCatalog(cfg: PetConfig): AnimationGroup[] {
  const groups: AnimationGroup[] = []
  const push = (group: string, names: string[]) => {
    const list = uniq(names)
    if (list.length > 0) groups.push({ group, names: list })
  }

  push('待机', cfg.animations.idle)
  push('转向', cfg.animations.turn)
  push('点击回应', cfg.animations.clicks)
  push('移动', cfg.animations.moves.actions.map((a) => a.name))
  for (const c of cfg.animations.categories) push(c.id, c.actions)
  // 拖动姿态（events.dragging 允许"档位"写法：字符串或字符串数组）
  push(
    '被拖起来',
    cfg.animations.events.dragging.flatMap((s) => (typeof s === 'string' ? [s] : s)),
  )
  // 状态演出：与前面的分类池有重名（如「轻快记录」同时在 小动作 与 focused），**跨组去重**
  const seen = new Set(groups.flatMap((g) => g.names))
  push(
    '状态演出',
    Object.values(cfg.animations.states).flat().filter((n) => !seen.has(n)),
  )
  return groups
}

/** 名字是否可播；可播则原样返回，否则 null（供命令侧当白名单用） */
export function findPlayable(cfg: PetConfig, name: string): string | null {
  for (const g of animationCatalog(cfg)) {
    if (g.names.includes(name)) return name
  }
  return null
}