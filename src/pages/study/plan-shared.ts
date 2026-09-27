/**
 * 学 · 学分选课的共享件（**非组件**：常量 / 类型 / 格式化）
 *
 * 单独成文件的两个理由：
 *  ① 组件文件只该导出组件（`only-export-components` 的纪律）；
 *  ② 主页面、条目行、条目弹窗都要用这几个中文字典 —— 各写一份必然漂移
 *     （曾经 `money` 在四处各写一份、`BUY_STATUS` 两份，规则 5 查不出来）。
 */
import type { CoursePlanKind, CoursePlanStatus } from '../../types/entities'

/** 三个方向的中文名 */
export const KIND_LABEL: Record<CoursePlanKind, string> = {
  limited: '限选',
  public: '公选',
  pe: '体育',
}

/** 展示顺序：限选 → 公选 → 体育（与培养方案的习惯一致） */
export const KIND_ORDER: CoursePlanKind[] = ['limited', 'public', 'pe']

export const STATUS_LABEL: Record<CoursePlanStatus, string> = {
  selected: '已选',
  candidate: '候选',
  unavailable: '不可选',
}

/** 状态记号：与你自己的记法一致（✓ 已选 / □ 候选 / ✕ 不可选） */
export const STATUS_MARK: Record<CoursePlanStatus, string> = {
  selected: '✓',
  candidate: '□',
  unavailable: '✕',
}

/** 条目表单的草稿。学分用字符串存 —— 输入过程中的空串/半截数字不该被 `Number` 吃掉 */
export interface PlanDraft {
  kind: CoursePlanKind
  group: string
  title: string
  credit: string
  teacher: string
  status: CoursePlanStatus
  note: string
}

export const emptyDraft = (kind: CoursePlanKind, group = ''): PlanDraft => ({
  kind,
  group,
  title: '',
  credit: '',
  teacher: '',
  status: 'candidate',
  note: '',
})

/** 学分去掉多余的 .0（12.0 → 12），保留一位小数（12.5 → 12.5） */
export function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1)
}
