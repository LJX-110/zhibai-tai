/**
 * 选课规划 · 学分进度（纯函数，供「学 · 学分 · 选课」用）
 *
 * Step 5-1 · E5 从 `services/study.ts` 拆出。
 * 拆分理由是**职责**而不是行数：`study.ts` 管的是"课表怎么取课"（周次 / 单双周 /
 * 停课 / 调课 / 今天上哪几节），这里管的是"培养方案的学分账"（目标 / 已选 / 差额 / 公选分组）。
 * 两件事的消费方、测试与失败模式完全不同 —— 混在一个文件里时，
 * 改课表取课逻辑要读一遍学分口径，反之亦然。
 *
 * ⚠️ 与 `Course`（正式课表）**刻意互不依赖**：学分进度的真相就在规划里，
 * 不去依赖课程是否还在（见 `types/entities.ts` 的 `CoursePlan` 注释）。
 */
import type { CoursePlan, CoursePlanKind } from '../types/entities'

/* ---------------- 选课规划：学分进度（纯函数，供「学 · 学分 · 选课」用） ---------------- */

/** 一个方向的进度 */
export interface PlanKindProgress {
  kind: CoursePlanKind
  /** 已获得学分（`status === 'selected'` 的 credit 之和） */
  selected: number
  goal: number
  /** 还差多少 —— **超额不倒扣**，见 `planProgress` */
  remaining: number
  /** 是否已达标（`goal > 0` 且 `selected >= goal`）；目标为 0 时不算达标 */
  reached: boolean
}

export interface PlanProgress {
  byKind: Record<CoursePlanKind, PlanKindProgress>
  total: { selected: number; goal: number; remaining: number }
}

/** 一条规划的学分：非有限值 / 负数一律记 0（一个 NaN 能把整页进度算废） */
function planCredit(c: CoursePlan): number {
  const v = c.credit
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * 学分进度 —— 纯函数，不碰 store。
 *
 * ## 三条口径
 *  · **只数 `status === 'selected'`** —— 候选与不可选不是"已获得"。这正是
 *    `Course` 与 `CoursePlan` 分开的意义：进度的真相在规划里，不去依赖课程表；
 *  · **`remaining = max(goal - selected, 0)`** —— **超额不倒扣**：选多了显示「已完成」，
 *    而不是一个负的"还差"（负数会被读成"还欠"，含义正好相反）；
 *  · **目标为 0 视为未设**（`reached` 恒为 false），不去猜用户想要多少学分。
 */
export function planProgress(
  items: readonly CoursePlan[],
  goals: { limited: number; public: number; pe: number },
): PlanProgress {
  const kinds: CoursePlanKind[] = ['limited', 'public', 'pe']
  const byKind = {} as Record<CoursePlanKind, PlanKindProgress>
  for (const kind of kinds) {
    const selected = items
      .filter((c) => c.kind === kind && c.status === 'selected')
      .reduce((sum, c) => sum + planCredit(c), 0)
    const raw = goals[kind]
    const goal = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0
    byKind[kind] = {
      kind,
      selected,
      goal,
      remaining: Math.max(goal - selected, 0),
      reached: goal > 0 && selected >= goal,
    }
  }
  const totalSelected = kinds.reduce((s, k) => s + byKind[k].selected, 0)
  const totalGoal = kinds.reduce((s, k) => s + byKind[k].goal, 0)
  return {
    byKind,
    total: {
      selected: totalSelected,
      goal: totalGoal,
      remaining: Math.max(totalGoal - totalSelected, 0),
    },
  }
}

/**
 * 公选按 `group` 分组（**保持首次出现的顺序**，不排序 —— 那是用户录入的顺序）。
 *
 * 只处理 `kind === 'public'` 且有 `group` 的条目；**没填分组的由调用方另行处理**
 * （本函数不替用户决定该归到哪一组）。
 */
export function publicGroupsOf(
  items: readonly CoursePlan[],
): { group: string; items: CoursePlan[] }[] {
  const order: string[] = []
  const map = new Map<string, CoursePlan[]>()
  for (const c of items) {
    if (c.kind !== 'public') continue
    const g = c.group?.trim()
    if (!g) continue
    if (!map.has(g)) {
      map.set(g, [])
      order.push(g)
    }
    map.get(g)!.push(c)
  }
  return order.map((group) => ({ group, items: map.get(group)! }))
}
