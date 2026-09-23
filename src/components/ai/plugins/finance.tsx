/**
 * 财 · 插件 —— 支出明细 + 记账动作
 *
 * 基础概览里已有"本月收入/支出"一条；这里补的是追问型的明细（分类排行 + 最近 5 笔）。
 */
import { useFinanceStore } from '../../../stores/useFinanceStore'
import { createId, nowISO, todayISO } from '../../../utils/id'
import { numberOf, textOf } from '../action-protocol'
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
    create_finance: {
      label: '记一笔',
      fields: {
        kind: { kind: 'choice', values: ['expense', 'income'] }, // 必填：收支不明就不落库
        amount: { kind: 'amount' }, // 必须是有限正数，自动规整到分
        category: { kind: 'text', fallback: '未分类' },
        note: { kind: 'text' },
        date: { kind: 'date' }, // 可选，缺省用今天
      },
      summary: (f) => `¥${numberOf(f, 'amount')} · ${textOf(f, 'category')}`,
      run: async (f) => {
        const now = nowISO()
        return useFinanceStore.getState().add({
          id: createId(),
          kind: textOf(f, 'kind') as 'expense' | 'income',
          amount: numberOf(f, 'amount'),
          category: textOf(f, 'category') || '未分类',
          date: textOf(f, 'date') || todayISO(),
          note: textOf(f, 'note') || undefined,
          isPurchase: false,
          createdAt: now,
          updatedAt: now,
        })
      },
      preview: (f) => (
        <>
          {/* 收入/支出由本插件判定：只有它认识 kind 这个字段 */}
          <div className="eyebrow text-ink-faint">
            {textOf(f, 'kind') === 'income' ? '收入' : '支出'}
          </div>
          <div className="font-medium">
            ¥{numberOf(f, 'amount')} · {textOf(f, 'category')}
          </div>
          {textOf(f, 'note') ? <div className="text-xs text-ink-muted">{textOf(f, 'note')}</div> : null}
          {textOf(f, 'date') ? <div className="text-xs text-ink-faint">{textOf(f, 'date')}</div> : null}
        </>
      ),
    },
  }
}
