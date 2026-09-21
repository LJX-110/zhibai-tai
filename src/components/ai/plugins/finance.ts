/**
 * 财 · 插件 —— 支出明细 + 记账动作
 *
 * 基础概览里已有"本月收入/支出"一条；这里补的是追问型的明细（分类排行 + 最近 5 笔）。
 */
import { useFinanceStore } from '../../../stores/useFinanceStore'
import { createId, nowISO, todayISO } from '../../../utils/id'
import type { TianjiPlugin } from './index'

export const financePlugin: TianjiPlugin = {
  id: 'finance',

  detail: (q) => {
    if (!/钱|花|支出|收入|账|预算|买|消费|花了/.test(q)) return []
    const fins = useFinanceStore.getState().items
    const month = todayISO().slice(0, 7)
    const lines: string[] = []

    const monthExpense = fins.filter((f) => f.kind === 'expense' && f.date.startsWith(month))
    const byCat = new Map<string, number>()
    for (const f of monthExpense) {
      const k = f.category || '未分类'
      byCat.set(k, (byCat.get(k) ?? 0) + f.amount)
    }
    const ranked = [...byCat.entries()].sort((a, b) => b[1] - a[1])
    if (ranked.length > 0) {
      lines.push('【本月支出分类】')
      for (const [k, v] of ranked.slice(0, 8)) lines.push(`  ${k} ¥${v.toFixed(2)}`)
    }
    const recent = fins.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    if (recent.length > 0) {
      lines.push('【最近 5 笔】')
      for (const f of recent) {
        lines.push(`  ${f.date} ${f.kind === 'income' ? '收' : '支'} ¥${f.amount.toFixed(2)} ${f.merchant || f.category || ''}`)
      }
    }
    return lines
  },

  actions: {
    create_finance: async (a) => {
      const now = nowISO()
      return useFinanceStore.getState().add({
        id: createId(),
        kind: a.kind,
        amount: a.amount,
        category: a.category,
        date: a.date ?? todayISO(),
        note: a.note || undefined,
        isPurchase: false,
        createdAt: now,
        updatedAt: now,
      })
    },
  },
}
