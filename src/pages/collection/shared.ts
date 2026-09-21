/**
 * 藏 · 藏品页专属的常量与类型
 *
 * 「介质」已**数据化**（2026-09-21）：它不再是写死的枚举，而是 categories 业务表里
 * scope = `collection_medium` 的一行行数据 —— 可增删、跨设备同步，与「术的类型」（`ai_type`）
 * 同一套机制。改动缘由：写死的 9 项没法扩展（想加「播客」「剧集」只能选「自定义」）。
 *
 * ⚠️ 与「用途分类」（scope = `collection`）仍是**两个独立维度**，不要合并：
 * 两者一旦共用一份数据，界面上就会出现两个都叫「小说」的下拉，用户无法理解区别 ——
 * 这是当初专门拆开的原因（见 services/categories.ts 的说明）。
 */
import type { CollectionType } from '../../types/entities'
import { COLLECTION_MEDIUM_LEGACY_LABEL } from '../../services/categories'

/** 旧枚举键 → 介质名。只用于历史值兜底显示（迁移映射在 services/categories.ts）。 */
const TYPE_LABEL: Record<CollectionType, string> = COLLECTION_MEDIUM_LEGACY_LABEL

/**
 * 介质显示名：数据化之后 `type` 存的就是介质名（如「小说」），直接显示即可；
 * 只有**存量旧记录**里还是枚举键（`novel`），走 TYPE_LABEL 兜底映射。
 * 用户删掉某个介质后旧记录仍要能显示出东西，不能显示空白 —— 所以最后原样返回。
 */
export function typeLabel(type: string): string {
  if (!type) return '未分类'
  return TYPE_LABEL[type as CollectionType] ?? type
}

/**
 * 介质签条色。数据化之后介质名是自由的，不能再按具体名字硬编码三档 ——
 * 改为按名称哈希取色：同一介质在任何位置都是同一色（列表卡与详情头共用本函数）。
 * 含「GitHub」「项目」时仍走原来的强调色，保持既有视觉记忆。
 */
const STRIPE_PALETTE = ['bg-gold-btn/70', 'bg-teal/60', 'bg-cinnabar/55', 'bg-bronze/60'] as const

export const typeStripe = (type: string) => {
  if (type === 'github' || type === 'GitHub') return 'bg-teal/60'
  if (type === 'project' || type === '项目') return 'bg-cinnabar/55'
  let h = 0
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) % 997
  return STRIPE_PALETTE[h % STRIPE_PALETTE.length]
}

export interface FormState {
  title: string
  type: string
  category: string
  tags: string
  url: string
  description: string
  rating: string
  status: string
  notes: string
}

export const EMPTY_FORM: FormState = {
  title: '',
  type: '',
  category: '',
  tags: '',
  url: '',
  description: '',
  rating: '',
  status: '',
  notes: '',
}

/** AI 整理的建议结构（预览后才写库） */
export interface TidySuggestion {
  description: string
  tags: string[]
  category: string
  reason: string
}
