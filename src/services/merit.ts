/**
 * 修行 · 功行与境界
 *
 * 与 `services/cultivation.ts` 的分工（**两者不要混**）：
 *  · 本文件 = **总量与境界**：单一指标「功行」，由**动作流水**逐日累积定阶；
 *  · `cultivation.ts` = **今日炁象**：五维快照，只作为首页罗盘的视觉输入，**不参与境界判定**。
 *
 * ## 为什么用「功行」
 * 取道教《太微仙君功过格》的用语 —— 真实的道教修行记账体系（逐日记功记过），
 * 比"经验值"更贴文化根，也天然对应"完成有意义的行为即提升"。
 *
 * ## 为什么以动作流水为数据源，而不是逐个埋点
 * `recordActivity()` 已在各板块铺开（task / pomodoro / habit / water / finance /
 * collection / project / intelligence / divination / note），且**自带短时去重**。
 * 用它当单一数据源，既覆盖八板块、又不新增十几次埋点，还顺带防了刷分。
 * 唯一缺口是「术」（AI 资源）—— 已在 `ActivityType` 补 `ai` 类型并接上。
 *
 * ## 境界：六境 + 抱朴六轮
 * **抱朴 → 冲和 → 玄同 → 凝神 → 逍遥 → 合道**（名称取自《道德经》《庄子》：
 * 抱朴、冲和、玄同、合道出《道德经》，凝神出《庄子·达生》，逍遥出《庄子·逍遥游》）；
 * 抱朴境内分**六轮**（守一·心斋·坐忘·朝彻·见独·撄宁，出自内丹「守一」与《庄子》修道次第）—— 这一层专门解决
 * 「提升过慢、缺乏反馈」：头几十功就能连过六轮，早期有连续的小进阶感，
 * 而不是攒够 300 点才看见第一次变化。
 */
import type { ActivityItem, ActivityType } from '../types/entities'
import { toISODate } from '../utils/id'

/* ------------------------------------------------------------------ *
 * 一、九板块净行表
 * ------------------------------------------------------------------ */

/** 计入修行的板块（「观」是汇总视图，不记功 —— 记了会与各板块重复计数） */
export type MeritSection = 'action' | 'cultivate' | 'study' | 'finance' | 'collection' | 'intelligence' | 'occult' | 'ai'

export interface SectionRule {
  key: MeritSection
  /** 板块名，与导航一致 */
  label: string
  /** 该板块的动作流水类型 */
  types: ActivityType[]
  /** 每条动作记多少功 */
  perAction: number
  /** 该板块每日记功上限 —— 防止"刷同一件事"把境界刷上去 */
  dailyCap: number
}

/**
 * 每日每板块上限统一 8 功：九板块理论日上限 64 功，实际正常使用约 15–30 功。
 * 上限的意义不是限制正常使用，而是让"连续做同一件事刷分"失去意义。
 */
const SECTION_RULES: SectionRule[] = [
  { key: 'action', label: '行', types: ['task', 'note'], perAction: 2, dailyCap: 8 },
  { key: 'cultivate', label: '修', types: ['habit', 'water'], perAction: 2, dailyCap: 8 },
  { key: 'study', label: '学', types: ['pomodoro'], perAction: 2, dailyCap: 8 },
  { key: 'finance', label: '财', types: ['finance'], perAction: 1, dailyCap: 8 },
  { key: 'collection', label: '藏', types: ['collection', 'project'], perAction: 1, dailyCap: 8 },
  { key: 'intelligence', label: '情', types: ['intelligence'], perAction: 1, dailyCap: 8 },
  { key: 'occult', label: '奇', types: ['divination'], perAction: 2, dailyCap: 8 },
  { key: 'ai', label: '术', types: ['ai'], perAction: 2, dailyCap: 8 },
]

const TYPE_TO_SECTION = new Map<ActivityType, SectionRule>()
for (const r of SECTION_RULES) for (const t of r.types) TYPE_TO_SECTION.set(t, r)

export interface SectionMerit {
  key: MeritSection
  label: string
  /** 今日该板块的动作条数 */
  count: number
  /** 今日该板块已获功行（已受上限约束） */
  merit: number
  dailyCap: number
}

export interface DailyMerit {
  total: number
  sections: SectionMerit[]
}

/**
 * 今日净行（纯函数）—— 由动作流水算出今天的功行。
 *
 * ⚠️ 比较日期必须走 `toISODate(new Date(timestamp))`：流水的时间戳是 **UTC ISO 串**，
 * 直接 `slice(0, 10)` 在东八区凌晨会整体差一天（本仓库踩过多次的老坑）。
 */
export function dailyMerit(activities: ActivityItem[], today = toISODate(new Date())): DailyMerit {
  const counts = new Map<MeritSection, number>()
  for (const a of activities) {
    const at = new Date(a.timestamp)
    if (Number.isNaN(at.getTime())) continue
    if (toISODate(at) !== today) continue
    const rule = TYPE_TO_SECTION.get(a.entityType)
    if (!rule) continue
    counts.set(rule.key, (counts.get(rule.key) ?? 0) + 1)
  }
  const sections: SectionMerit[] = SECTION_RULES.map((r) => {
    const count = counts.get(r.key) ?? 0
    return {
      key: r.key,
      label: r.label,
      count,
      merit: Math.min(count * r.perAction, r.dailyCap),
      dailyCap: r.dailyCap,
    }
  })
  return { total: sections.reduce((n, s) => n + s.merit, 0), sections }
}

/* ------------------------------------------------------------------ *
 * 二、六境 + 抱朴六轮
 * ------------------------------------------------------------------ */

export interface RealmStep {
  /** 达成该阶所需的累计功行 */
  at: number
  realm: string
  /** 仅抱朴境内有轮名 */
  wheel?: string
}

/**
 * 阶次表（升序）。门槛设计直接针对"提升过慢"：
 * 前六阶（抱朴六轮）每 15 功一进，几天的正常使用就能连过数轮；
 * 之后拉长到 300 / 900 / 2400 / 6000，让后期有分量。
 */
export const REALM_STEPS: RealmStep[] = [
  { at: 0, realm: '抱朴', wheel: '守一' },
  { at: 15, realm: '抱朴', wheel: '心斋' },
  { at: 30, realm: '抱朴', wheel: '坐忘' },
  { at: 45, realm: '抱朴', wheel: '朝彻' },
  { at: 60, realm: '抱朴', wheel: '见独' },
  { at: 75, realm: '抱朴', wheel: '撄宁' },
  { at: 90, realm: '冲和' },
  { at: 300, realm: '玄同' },
  { at: 900, realm: '凝神' },
  { at: 2400, realm: '逍遥' },
  { at: 6000, realm: '合道' },
]

/**
 * 境界的尊称 —— 沿用旧体系的层级位置（第 3/4/5 阶），只换名字：
 * 玄同称道人、凝神称真人、逍遥称真君。
 */
const REALM_HONORIFIC: Record<string, string | undefined> = {
  抱朴: undefined,
  冲和: undefined,
  玄同: '道人',
  凝神: '真人',
  逍遥: '真君',
  合道: undefined,
}

export interface RealmState {
  /** 阶次在 REALM_STEPS 里的下标 */
  rank: number
  realm: string
  wheel?: string
  /** 显示名：抱朴境内带轮名（"抱朴·心斋"），其余只显境界 */
  title: string
  honorific?: string
  /** 该阶的说明（写清"这一阶意味着什么"，而不是空泛的鼓励） */
  desc: string
}

const REALM_DESC: Record<string, string> = {
  抱朴: '见素抱朴，守其本真。修行自此有常，六轮递进皆在打底。',
  冲和: '冲气以为和，阴阳既调。日用之间已能自持。',
  玄同: '和其光，同其尘。挫锐解纷之后，根基乃固，不为外境所摇。',
  凝神: '用志不分，乃凝于神。事来则应，事去不留。',
  逍遥: '乘天地之正，而御六气之辩，恶乎待哉。久修之力始成，非一日所积。',
  合道: '同于道者，道亦乐得之。与道同久，此境以年计。',
}

export function realmOf(merit: number): RealmState {
  let rank = 0
  for (let i = REALM_STEPS.length - 1; i >= 0; i--) {
    if (merit >= REALM_STEPS[i].at) {
      rank = i
      break
    }
  }
  const step = REALM_STEPS[rank]
  return {
    rank,
    realm: step.realm,
    wheel: step.wheel,
    title: step.wheel ? `${step.realm}·${step.wheel}` : step.realm,
    honorific: REALM_HONORIFIC[step.realm],
    desc: REALM_DESC[step.realm] ?? '',
  }
}

export interface RealmProgress {
  realm: RealmState
  /** 下一阶门槛；已至顶阶为 null */
  next: number | null
  nextTitle: string | null
  /** 本阶内进度 0-1（顶阶恒 1） */
  percent: number
  /** 距下一阶还差多少功行 */
  remaining: number
}

export function realmProgress(merit: number): RealmProgress {
  const realm = realmOf(merit)
  const nextIdx = realm.rank + 1
  if (nextIdx >= REALM_STEPS.length) {
    return { realm, next: null, nextTitle: null, percent: 1, remaining: 0 }
  }
  const from = REALM_STEPS[realm.rank].at
  const nextStep = REALM_STEPS[nextIdx]
  const span = nextStep.at - from
  const nextStepTitle = nextStep.wheel ? `${nextStep.realm}·${nextStep.wheel}` : nextStep.realm
  return {
    realm,
    next: nextStep.at,
    nextTitle: nextStepTitle,
    percent: span > 0 ? Math.max(0, Math.min(1, (merit - from) / span)) : 1,
    remaining: Math.max(0, nextStep.at - merit),
  }
}
