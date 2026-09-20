/**
 * 情报源管理 · 常量与表单类型
 */
import type { IntelligenceProviderId } from '../../types/entities'

export const PROVIDER_LABEL: Record<IntelligenceProviderId, string> = {
  github: 'GitHub',
  rss: 'RSS',
  atom: 'Atom',
  json: 'JSON',
  rest: 'REST',
  web: 'Web',
  custom: '自定义',
  steam: 'Steam',
  rawg: 'RAWG',
  jikan: 'Jikan',
  bilibili: 'B 站',
  ai: 'AI',
}

export const PROVIDER_ORDER: IntelligenceProviderId[] = [
  'bilibili',
  'steam',
  'rawg',
  'jikan',
  'github',
  'rss',
  'atom',
  'json',
  'rest',
  'web',
  'custom',
]

export const CONFIG_HINT: Partial<Record<IntelligenceProviderId, string>> = {
  bilibili: 'JSON：{"keyword":"鸣潮"}（可选 order: pubdate|click，需先在下方配置自建代理）',
  steam: 'JSON：{"appid":730}（Steam 应用 ID）',
  rawg: 'JSON：{"key":"你的 RAWG key"}',
  jikan: 'JSON：{"mode":"season|top|search","type":"anime|manga","q":"关键词"}',
  github: 'JSON：{"queries":["topic:local-first"]}',
  web: 'JSON：{"itemSel":"article","titleSel":"h2","linkSel":"a","summarySel":"p","timeSel":"time"}',
  json: 'JSON：{"listPath":"items","titleKey":"title","urlKey":"url","summaryKey":"summary","dateKey":"date"}',
  rest: 'JSON：{"listPath":"data.list","titleKey":"name","urlKey":"html_url"}',
}

/** 必须由用户填 url 才能工作的 Provider（其余靠 config 或内置端点） */
export const NEEDS_URL: IntelligenceProviderId[] = ['rss', 'atom', 'custom', 'json', 'rest', 'web']

export interface FormState {
  name: string
  provider: IntelligenceProviderId
  url: string
  category: string
  config: string
}

export const EMPTY: FormState = { name: '', provider: 'rss', url: '', category: '科技', config: '' }
