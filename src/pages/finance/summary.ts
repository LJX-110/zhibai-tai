/**
 * 财 · **非组件的共享件**：金额格式化 / 台账筛选 / 月度汇总
 *
 * ## 为什么单独成文件
 * ① 与 `shared.tsx`（纯组件）分家：组件与非组件同文件会让 Fast Refresh 失去完整性；
 * ② 更实际的原因 —— 这几个东西此前在**四处各写了一份**：
 *    `shared.tsx` 与 BuyTab / LedgerTab / StatsTab 各自 `const money = ...`，
 *    `BUY_STATUS` 也在 `shared.tsx` 与 BuyTab 各一份。
 *    而 `check:rules` 规则 5（死导出）**查不出来** —— 它按名字全仓搜，
 *    别的文件里那份同名局部定义正好替死导出"续了命"。
 *    于是"改一处忘另一处"是必然的：某天改了分组口径，三个页签里会有一个不跟着变。
 *    收敛到这里之后，全仓只有一份。
 */
import { useMemo } from 'react'
import { useBudgetStore, useFinanceStore } from '../../stores/useFinanceStore'
import { todayISO } from '../../utils/id'

/** 金额显示：千分位 + 两位小数（全站财页唯一实现） */
export const money = (n: number) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type LedgerFilter = 'all' | 'expense' | 'income'

/** 记账筛选（原先漏抽这一条：它夹在 hook 与第一个 Tab 之间） */
export const LEDGER_FILTERS: { key: LedgerFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
]

/** 本月口径的收支与预算（记账 / 统计两个页签共用；月界取本地日期，避免 UTC 差一天） */
export function useMonthSummary() {
  const records = useFinanceStore((s) => s.items)
  const budgets = useBudgetStore((s) => s.items)
  const month = todayISO().slice(0, 7)
  return useMemo(() => {
    const inMonth = records.filter((r) => r.date.startsWith(month))
    const income = inMonth.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0)
    const expense = inMonth.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0)
    const budget = budgets.find((b) => b.month === month)
    return { income, expense, balance: income - expense, budget: budget?.amount ?? 0, month }
  }, [records, budgets, month])
}
