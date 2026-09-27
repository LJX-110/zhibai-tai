/**
 * 桌宠运行时位置 —— **"此刻到底在哪"的唯一真相**
 *
 * ## 为什么需要它
 * 此前一次移动的做法是：进入 `move` 段时把 `posRef` 直接写成**终点**，
 * 视觉交给 CSS `transition` 补间。于是 JS 侧从移动开始的第一毫秒起，
 * "逻辑位置"就已经是终点，而"视觉位置"还在路上 —— 两者只在移动结束那一瞬一致。
 *
 * 后果（都是用户看得见的）：
 *  · 移动中点它一下 → 下一帧**瞬移到终点**；
 *  · 移动中抓住它 → 抓取偏移按终点算 → 宠物**跳到别处**；
 *  · 移动中旋屏 → 按终点夹取 → 视觉跳变；
 *  · 状态机算"我现在在哪"拿到的是终点 → 新一段移动的起点也是错的。
 *
 * 现在改成**按时间求位置**（线性，保持原有视觉节奏），JS 侧任何时候都有一个
 * 真实的当前坐标；任何打断都先 settle 到它，再从它继续。
 *
 * 纯函数、无 DOM、无时间源（`now` 由调用方传入）—— 为了能被单测钉住。
 */

/** 一次线性移动的完整描述 */
export interface Movement {
  fromX: number
  fromY: number
  toX: number
  toY: number
  /** 起始时刻（ms，与调用方的 now 同源） */
  startAt: number
  /** 时长（ms）；<= 0 视为瞬时到位 */
  duration: number
}

export function createMovement(o: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  startAt: number
  duration: number
}): Movement {
  return {
    fromX: o.from.x,
    fromY: o.from.y,
    toX: o.to.x,
    toY: o.to.y,
    startAt: o.startAt,
    duration: Math.max(0, o.duration),
  }
}

/** 进度 [0,1]；超出时长一律夹到 1（不会"走过站再回来"） */
export function movementProgress(m: Movement, now: number): number {
  if (!(m.duration > 0)) return 1
  const raw = (now - m.startAt) / m.duration
  if (!Number.isFinite(raw)) return 1
  return Math.min(1, Math.max(0, raw))
}

/** 当前真实位置（线性插值）。**打断时就是靠它拿到"视觉正在哪儿"** */
export function positionAt(m: Movement, now: number): { x: number; y: number } {
  const p = movementProgress(m, now)
  return {
    x: m.fromX + (m.toX - m.fromX) * p,
    y: m.fromY + (m.toY - m.fromY) * p,
  }
}

export function isMovementDone(m: Movement, now: number): boolean {
  return movementProgress(m, now) >= 1
}

/** 位置记录（本机存档位；坐标是宿主矩形内的像素） */
export interface StoredPosition {
  x: number
  y: number
}

/**
 * 首次落位的位置来源优先级（**顺序就是语义，不要重排**）：
 *
 *  1. `local`  —— 本机存档（设备级状态，换设备不跟随，这是刻意的）
 *  2. `legacy` —— 旧版写在业务表 `petState.position` 里的值。
 *                 它曾把"高频像素坐标"当同步业务数据，已废弃；
 *                 这里只做**一次性读取**，之后不再依赖（字段本身不删）。
 *  3. `anchor` —— 都没有时按配置的角落 + 边距落位（新用户）
 *
 * `fromLegacy` 为 true 时调用方应把结果写回本机存档 —— 完成"旧数据 → 本机状态"的迁移。
 */
export function resolveInitialPosition(o: {
  local: StoredPosition | null
  legacy: StoredPosition | null
  anchor: StoredPosition
}): { position: StoredPosition; fromLegacy: boolean } {
  if (o.local) return { position: o.local, fromLegacy: false }
  if (o.legacy) return { position: o.legacy, fromLegacy: true }
  return { position: o.anchor, fromLegacy: true }
}

/**
 * 旧字段是否算"有值"。
 *
 * `{0,0}` 是旧版从没写过位置时的默认行（以及"宠物恰好在左上角"这种极罕见情况）——
 * 两者无法区分，一律当没有：把它当位置会**把宠物钉死在左上角**，
 * 而这比"落回配置角落"更糟。
 */
export function usableLegacyPosition(p: StoredPosition | null | undefined): StoredPosition | null {
  if (!p) return null
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  if (p.x === 0 && p.y === 0) return null
  return { x: p.x, y: p.y }
}
