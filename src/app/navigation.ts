/**
 * 一级导航配置 —— 观 行 修 学 藏 情 奇 术 + 系统
 * 桌面侧栏与移动底栏共用此配置
 */
import {
  Archive,
  Coins,
  Compass,
  Cpu,
  Eye,
  GraduationCap,
  Leaf,
  ListChecks,
  Rss,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type SectionId =
  | 'overview'
  | 'action'
  | 'cultivate'
  | 'study'
  | 'finance'
  | 'collection'
  | 'intelligence'
  | 'occult'
  | 'ai'
  | 'system'

export interface NavSection {
  id: SectionId
  /** 中文显示名 */
  label: string
  /** 英文副标签（侧栏双行导航） */
  sub: string
  /** 序号 */
  index: string
  icon: LucideIcon
  /** 一句说明 */
  desc: string
}

export const NAV_SECTIONS: NavSection[] = [
  { id: 'overview', label: '观', sub: 'TODAY', index: '01', icon: Eye, desc: '首页 · 今日态势' },
  { id: 'action', label: '行', sub: 'ACTION', index: '02', icon: ListChecks, desc: '待办 · 日程 · 笔记' },
  { id: 'cultivate', label: '修', sub: 'CULTIVATE', index: '03', icon: Leaf, desc: '斩三尸 · 身体 · 喝水 · 成长' },
  { id: 'study', label: '学', sub: 'STUDY', index: '04', icon: GraduationCap, desc: '番茄钟 · 课程表 · 作业 · 考试' },
  { id: 'finance', label: '财', sub: 'FINANCE', index: '05', icon: Coins, desc: '收支 · 购买 · 预算 · 统计' },
  { id: 'collection', label: '藏', sub: 'ARCHIVE', index: '06', icon: Archive, desc: '收藏 · 项目 · GitHub' },
  { id: 'intelligence', label: '情', sub: 'FEED', index: '07', icon: Rss, desc: '情报 · 灵感 · RSS · GitHub' },
  { id: 'occult', label: '奇', sub: 'OCCULT', index: '08', icon: Compass, desc: '抽签 · 八卦 · 六爻 · 奇门' },
  { id: 'ai', label: '术', sub: 'AI', index: '09', icon: Cpu, desc: 'AI 模型 · Tool · Skill · Agent' },
]

/** 底部「系统」 */
export const SYSTEM_SECTION: NavSection = {
  id: 'system',
  label: '系统',
  sub: 'SYSTEM',
  index: '·',
  icon: Settings,
  desc: '设置 · 数据 · 同步',
}

export const ALL_SECTIONS: NavSection[] = [...NAV_SECTIONS, SYSTEM_SECTION]

export function navSectionOf(id: SectionId): NavSection {
  return ALL_SECTIONS.find((s) => s.id === id) ?? ALL_SECTIONS[0]
}
