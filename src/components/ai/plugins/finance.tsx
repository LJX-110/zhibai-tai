/**
 * 财 · 插件 —— 支出明细 + 记账动作
 *
 * 基础概览里已有"本月收入/支出"一条；这里补的是追问型的明细（分类排行 + 最近 5 笔）。
 */
import { useBudgetStore, useFinanceStore } from '../../../stores/useFinanceStore'
import { createId, nowISO, todayISO } from '../../../utils/id'
import { money } from '../../../utils/money'
import { defineTool } from '../../../services/agent/tools'
import { numberOf, textOf } from '../action-protocol'
import type { TianjiPlugin } from './index'

export const financePlugin: TianjiPlugin = {
  id: 'finance',

  /**
   * 工具：本月财务概览。
   * ⚠️ **记账本身不是工具**（涉及金额，属高风险写入）—— 它走 `create_finance` 动作，
   * 由用户点确认后才落库（见 `services/agent/tools.ts` 的分工表）。
   */
  tools: [
    defineTool({
      id: 'finance.summary',
      name: '查本月收支',
      description: '取本月收入 / 支出 / 结余与预算使用情况（含支出分类前几名）。问"这月花了多少 / 还剩多少预算"时用它。',
      inputSchema: { month: '可选：yyyy-mm（默认本月）' },
      mode: 'read',
      riskLevel: 'read',
      execute: async (args) => {
        const month = typeof args.month === 'string' && /^\d{4}-\d{2}$/.test(args.month) ? args.month : todayISO().slice(0, 7)
        const fins = useFinanceStore.getState().items.filter((f) => f.date.startsWith(month))
        const income = fins.filter((f) => f.kind === 'income').reduce((s, f) => s + f.amount, 0)
        const expense = fins.filter((f) => f.kind === 'expense').reduce((s, f) => s + f.amount, 0)
        const byCat = new Map<string, number>()
        for (const f of fins.filter((x) => x.kind === 'expense')) {
          const k = f.category || '未分类'
          byCat.set(k, (byCat.get(k) ?? 0) + f.amount)
        }
        const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        const budget = useBudgetStore.getState().items.find((b) => b.month === month)
        const lines = [
          `${month}：收入 ${money(income)} · 支出 ${money(expense)} · 结余 ${money(income - expense)}`,
        ]
        if (top.length > 0) lines.push(`支出前三：${top.map(([k, v]) => `${k} ${money(v)}`).join('、')}`)
        if (budget) {
          const left = budget.amount - expense
          lines.push(left >= 0 ? `预算剩余 ${money(left)}` : `已超预算 ${money(-left)}`)
        }
        return { count: fins.length, text: lines.join('\n') }
      },
    }),
  ],

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
      for (const [k, v] of ranked.slice(0, 8)) lines.push(`  ${k} ¥${money(v)}`)
    }
    const recent = fins.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    if (recent.length > 0) {
      lines.push('【最近 5 笔】')
      for (const f of recent) {
        lines.push(`  ${f.date} ${f.kind === 'income' ? '收' : '支'} ¥${money(f.amount)} ${f.merchant || f.category || ''}`)
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
      summary: (f) => `¥${money(numberOf(f, 'amount'))} · ${textOf(f, 'category')}`,
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
            ¥{money(numberOf(f, 'amount'))} · {textOf(f, 'category')}
          </div>
          {textOf(f, 'note') ? <div className="text-xs text-ink-muted">{textOf(f, 'note')}</div> : null}
          {textOf(f, 'date') ? <div className="text-xs text-ink-faint">{textOf(f, 'date')}</div> : null}
        </>
      ),
    },
  }
}
