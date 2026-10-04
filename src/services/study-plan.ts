/**
 * 选课规划 · 学分进度 + 列表口径（纯函数，供「学 · 学分 · 选课」与天机工具用）
 *
 * Step 5-1 · E5 从 `services/study.ts` 拆出。
 * 拆分理由是**职责**而不是行数：`study.ts` 管的是"课表怎么取课"（周次 / 单双周 /
 * 停课 / 调课 / 今天上哪几节），这里管的是"培养方案的学分账"（目标 / 已选 / 差额 / 公选分组）。
 * 两件事的消费方、测试与失败模式完全不同 —— 混在一个文件里时，
 * 改课表取课逻辑要读一遍学分口径，反之亦然。
 *
 * 2026-10-02 增补：方向 / 状态中文字典（单一事实源）、搜索匹配、二级分类建议、
 * 排序比较与手动排序（`matchQuery` / `comparePlanItems` / `movePlanItem`）——
 * 这些全是**纯函数**，选课页与天机工具共用同一套口径。
 *
 * ⚠️ 与 `Course`（正式课表）**刻意互不依赖**：学分进度的真相就在规划里，
 * 不去依赖课程是否还在（见 `types/entities.ts` 的 `CoursePlan` 注释）。
 */
import type { CoursePlan, CoursePlanKind, CoursePlanStatus } from '../types/entities'

/* ---------------- 方向 / 状态的中文字典（单一事实源） ----------------
 * 2026-10-02 从 `pages/study/plan-shared.ts` 上移到服务层：
 * 天机工具（`courses.plan`）也要说同一套词 —— 页面侧仍从 plan-shared 转出，
 * 两处各写一份必然漂移（项目曾吃过多份 money 实现的亏）。 */

/** 三个方向的中文名 */
export const KIND_LABEL: Record<CoursePlanKind, string> = {
  limited: '限选',
  public: '公选',
  pe: '体育',
}

/** 展示顺序：限选 → 公选 → 体育（与培养方案的习惯一致） */
export const KIND_ORDER: readonly CoursePlanKind[] = ['limited', 'public', 'pe']

export const STATUS_LABEL: Record<CoursePlanStatus, string> = {
  selected: '已选',
  candidate: '候选',
  unavailable: '不可选',
}

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

/* ---------------- 选课列表：搜索 / 标签 / 排序（纯函数，2026-10-02） ---------------- */

/**
 * 归一化标签输入：按空白 / 中英文逗号 / 顿号切分，去空去重（保序）。
 * 单一实现 —— 弹窗保存与测试都用它，避免"存进去的标签和展示的不一致"。
 */
export function normalizeTags(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\s,，、]+/)) {
    const t = raw.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** 搜索匹配：课名 / 教师 / 二级分类 / 标签 / 备注，大小写不敏感（空查询恒真） */
export function matchesQuery(item: CoursePlan, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [item.title, item.teacher ?? '', item.group ?? '', item.note ?? '', ...(item.tags ?? [])]
    .join('\n')
    .toLowerCase()
  return hay.includes(q)
}

/** 某方向已录入的二级分类建议值（去重、按首次出现序）——**不做预设清单**，建议来自用户自己 */
export function groupSuggestions(items: readonly CoursePlan[], kind: CoursePlanKind): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of items) {
    if (c.kind !== kind) continue
    const g = c.group?.trim()
    if (!g || seen.has(g)) continue
    seen.add(g)
    out.push(g)
  }
  return out
}

/** 排序上下文：方向顺序 +（可选的）公选二级分类顺序（首次出现序，见 `publicGroupsOf`） */
export interface PlanSortContext {
  kindOrder?: readonly CoursePlanKind[]
  groupOrder?: ReadonlyMap<string, number>
}

/** 状态兜底序：已选 → 候选 → 不可选（与筛选行展示顺序一致） */
const STATUS_RANK: Record<CoursePlanStatus, number> = {
  selected: 0,
  candidate: 1,
  unavailable: 2,
}

/**
 * 列表排序键：方向 → **手动序**（有 order 的在前、按数值升序；无 order 的排在其后）
 * → 公选二级分类（传入 groupOrder 时）→ 状态 → 课名。
 *
 * ⚠️ 无 order 的条目保持既有兜底顺序 —— 手动排序只是"把想先看的提到前面"，
 * 不是"没排过就没顺序"。
 */
export function comparePlanItems(a: CoursePlan, b: CoursePlan, ctx: PlanSortContext = {}): number {
  const kindOrder = ctx.kindOrder ?? KIND_ORDER
  const kindDiff = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
  if (kindDiff !== 0) return kindDiff

  const oa = a.order ?? Number.MAX_SAFE_INTEGER
  const ob = b.order ?? Number.MAX_SAFE_INTEGER
  if (oa !== ob) return oa - ob

  if (ctx.groupOrder) {
    const ga = ctx.groupOrder.get(a.group ?? '') ?? Number.MAX_SAFE_INTEGER
    const gb = ctx.groupOrder.get(b.group ?? '') ?? Number.MAX_SAFE_INTEGER
    if (ga !== gb) return ga - gb
  }

  const sd = STATUS_RANK[a.status] - STATUS_RANK[b.status]
  if (sd !== 0) return sd
  return a.title.localeCompare(b.title, 'zh-Hans-CN')
}

/**
 * 手动排序：把某条在**同方向内**上移 / 下移一位，返回新的条目数组（不改原数组）。
 *
 * 做法：先把该方向按当前有效顺序「物化」成 `order`（0..n-1），再与相邻项交换 ——
 * 物化让"第一次点 ↑↓"就有确定的先后（否则多条都没 order 时无法比较）；
 * 交换后其余条目保持原样（含 order 未变者，调用方只需保存真正变化的行）。
 *
 * 边界（回到原位）时原样返回 —— 调用方据此把按钮置灰，不必自己算边界。
 */
export function movePlanItem(
  items: readonly CoursePlan[],
  id: string,
  dir: -1 | 1,
  ctx: PlanSortContext = {},
): CoursePlan[] {
  const target = items.find((c) => c.id === id)
  if (!target) return [...items]
  const sameKind = items
    .filter((c) => c.kind === target.kind)
    .sort((a, b) => comparePlanItems(a, b, ctx))
  const idx = sameKind.findIndex((c) => c.id === id)
  const swapIdx = idx + dir
  if (idx < 0 || swapIdx < 0 || swapIdx >= sameKind.length) return [...items]

  const ordered = sameKind.map((c, i) => ({ ...c, order: i }))
  const a = ordered[idx]
  const b = ordered[swapIdx]
  ordered[idx] = { ...a, order: b.order }
  ordered[swapIdx] = { ...b, order: a.order }

  const byId = new Map(ordered.map((c) => [c.id, c]))
  return items.map((c) => byId.get(c.id) ?? c)
}
