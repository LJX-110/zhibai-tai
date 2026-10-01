/**
 * 桌宠菜单的条目（Step 5-3E 重设计）
 *
 * 条目顺序与分组只在这里定义 —— 菜单只有一种容器（`PetMenu` 紧凑浮层，见其文件头），
 * 改一处即全站生效。
 *
 * ## 分组（`PET_MENU_DIVIDER_AT` 之前是"互动与跳转"，之后是"安静 / 设置 / 关掉"）
 * 用户点菜单多半想"跟它玩一下"或"去某件事"，善后类的（安静 / 设置 / 关掉）放后面。
 */
import {
  CalendarCheck,
  ClipboardPen,
  Eye,
  MessageCircle,
  Moon,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'

export type PetMenuAction = 'say' | 'today' | 'seclusion' | 'quick' | 'hush' | 'settings' | 'off'

export interface PetMenuItem {
  key: PetMenuAction
  label: string
  /** 一句说明（移动端抽屉里显示；桌面浮层只作 title） */
  desc: string
  icon: LucideIcon
  danger?: boolean
}

export const PET_MENU_ITEMS: PetMenuItem[] = [
  { key: 'say', label: '让它说句话', desc: '按人设说一句（可接 AI）', icon: MessageCircle },
  { key: 'today', label: '看今日', desc: '跳到今日总览', icon: Eye },
  { key: 'seclusion', label: '开始一次闭关', desc: '用番茄钟专注一段', icon: CalendarCheck },
  { key: 'quick', label: '记一笔', desc: '打开命令面板', icon: ClipboardPen },
  { key: 'hush', label: '安静一小时', desc: '只压搭话，不动通知设置', icon: Moon },
  { key: 'settings', label: '桌宠设置', desc: '动作 / 台词 / 大小 / 漫游', icon: Settings },
  { key: 'off', label: '关掉桌宠', desc: '随时可在设置里再开', icon: X, danger: true },
]

/** 分隔线插在第 N 项之前（即下标 4 的「安静一小时」之前） */
export const PET_MENU_DIVIDER_AT = 4