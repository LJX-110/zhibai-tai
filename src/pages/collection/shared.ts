/**
 * 藏 · 藏品页专属的常量与类型
 */
import type { CollectionType } from '../../types/entities'

export const TYPE_LABEL: Record<CollectionType, string> = {
  novel: '小说',
  anime: '动漫',
  game: '游戏',
  film: '影视',
  book: '书籍',
  github: 'GitHub',
  project: '项目',
  ui_ref: 'UI 参考',
  inspiration: '灵感',
  custom: '自定义',
}

/** 类型签条色 —— 列表卡与详情头共用同一份，避免两边各写一套导致颜色对不上 */
export const typeStripe = (type: CollectionType) =>
  type === 'github' ? 'bg-teal/60' : type === 'project' ? 'bg-cinnabar/55' : 'bg-gold-btn/70'

export const TYPE_ORDER: CollectionType[] = [
  'novel',
  'anime',
  'game',
  'film',
  'book',
  'github',
  'project',
  'ui_ref',
  'inspiration',
  'custom',
]

export interface FormState {
  title: string
  type: CollectionType
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
  type: 'novel',
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
