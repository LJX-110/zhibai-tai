/**
 * 财 —— 分类常量与工具（服务层，供页面复用）
 */
import type { FinanceCategory } from '../types/entities'

export const FINANCE_CATEGORIES: { value: FinanceCategory; label: string }[] = [
  { value: 'dining', label: '餐饮' },
  { value: 'transport', label: '交通' },
  { value: 'study', label: '学习' },
  { value: 'fun', label: '娱乐' },
  { value: 'shopping', label: '购物' },
  { value: 'subscription', label: '订阅' },
  { value: 'salary', label: '收入' },
  { value: 'other', label: '其他' },
]

export function categoryLabel(c: FinanceCategory): string {
  return FINANCE_CATEGORIES.find((x) => x.value === c)?.label ?? c
}
