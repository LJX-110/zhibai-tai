/**
 * 分类体系 —— 默认值与一次性迁移读取
 *
 * 分类是业务表 `categories`（见 stores/useCategoryStore），这里只保留默认清单与旧数据读取。
 *
 * 默认词的设计要点 —— **两个维度必须互斥**：
 *  · 「类型」= 介质，固定枚举，不可编辑（小说/动漫/游戏/影视/书籍/GitHub/项目/UI 参考/灵感）；
 *  · 「分类」= 用途/进度，可增删、跨设备同步。
 *  旧默认值与「类型」重合了 7 项（小说/动漫/游戏/影视/书籍/GitHub/灵感），
 *  界面上出现两个都叫「小说」的筛选，用户根本无法理解区别。现在改成用途词，从根上消除歧义。
 */
import { INTELLIGENCE_CATEGORIES } from './intelligence/providers/index'
import type { CategoryScope } from '../types/entities'

/** 默认分类（首次播种与「恢复默认」共用同一份清单） */
export const DEFAULT_CATEGORIES: Record<CategoryScope, string[]> = {
  intel: INTELLIGENCE_CATEGORIES.filter((c) => c !== '全部' && c !== '自定义'),
  collection: ['待看', '在看', '看过', '参考资料', '素材', '工具', '其他'],
  ai: ['工具', '编码', '研究', '创作'], // 历史遗留：分类行已从界面移除，保留仅为兼容存量数据
  // 术的类型**完全数据化**：内置 7 类播种为普通类型行，与用户新建的同等可增删改
  ai_type: ['模型', 'Tool', 'Skill', 'Agent', 'Plugin', 'Prompt', 'Workflow'],
}

/**
 * 藏阁分类的旧默认清单（与「类型」重名的那一版）。
 * 仅用于一次性迁移识别：只有当用户**原封未动**时才替换成新清单，
 * 自己加过减过的一律不动 —— 迁移不该覆盖用户的选择。
 */
export const LEGACY_COLLECTION_CATEGORIES = [
  '小说',
  '动漫',
  '游戏',
  '影视',
  '书籍',
  'GitHub',
  '设计',
  '灵感',
  '其他',
]

/** 旧持久化键（升级前分类存在这里，迁移时读取一次） */
const LEGACY_SETTINGS_KEY = 'yishu-workbench:settings'

const LEGACY_FIELD: Record<CategoryScope, string> = {
  intel: 'intelCategories',
  collection: 'collectionCategories',
  ai: 'aiCategories',
  ai_type: '', // 术的类型没有旧版设置项，迁移读取自然落空
}

/**
 * 读取旧版本存在设置项里的分类。
 * 升级后设置项里已不再维护分类，这里只在首次播种时读一次，
 * 目的是别把用户自建的分类弄丢。
 */
export function legacyCategoryNames(scope: CategoryScope): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> }
    const value = parsed.state?.[LEGACY_FIELD[scope]]
    if (!Array.isArray(value)) return []
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  } catch {
    return []
  }
}
