/**
 * 财 · 共享 hook / 类型 / 子组件（记账 / 购买 / 统计共用，从 FinancePage 拆出）
 */
/**
 * 财 —— 记账 / 购买 / 预算 / 统计
 *
 * 精简原则（按频率分层）：
 *  · 记账：收入与支出同源一屏，不再分「收入」「支出」两个板块
 *  · 购买：独立板块，记录「准备买的东西 + 到手状态」，含取件提醒
 *  · 预算：月度口径 + 圆环进度
 *  · 统计：分类占比用圆环（Ring）呈现，比柱状更直观、也更省空间
 */
import { useMemo } from 'react'
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useBudgetStore, useFinanceStore } from '../../stores/useFinanceStore'
import { useInspectorStore } from '../../components/inspector/Inspector'

import { categoryLabel } from '../../services/finance'

import type { FinanceRecord, Purchase } from '../../types/entities'
import { todayISO } from '../../utils/id'
import { Seal } from '../../components/ui/Seal'

import { cn } from '../../utils/cn'
import { Badge } from '../../components/ui'

export const money = (n: number) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 购买状态三态：想买 → 已下单/待取件 → 已到手 */
export const BUY_STATUS: { key: Purchase['status']; label: string; desc: string }[] = [
  { key: 'want', label: '想买', desc: '收藏清单 · 还没下单' },
  { key: 'ordered', label: '待取', desc: '已下单 · 记得取件' },
  { key: 'done', label: '到手', desc: '已收到' },
]

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

export type LedgerFilter = 'all' | 'expense' | 'income'

/** 记账筛选（原先漏抽这一条：它夹在 hook 与第一个 Tab 之间） */
export const LEDGER_FILTERS: { key: LedgerFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
]

export function SummaryCell({ label, value, tone }: { label: string; value: string; tone: 'cinnabar' | 'teal' | 'ink' | 'bronze' }) {
  const toneClass = { cinnabar: 'text-cinnabar', teal: 'text-teal', ink: 'text-ink', bronze: 'text-bronze' }[tone]
  return (
    <div className="rounded-paper bg-raised px-3 py-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={cn('tabular mt-0.5 text-base font-semibold', toneClass)}>{value}</div>
    </div>
  )
}

export function FinanceRow({
  r,
  compact,
  onMore,
  onEdit,
  onDelete,
}: {
  r: FinanceRecord
  compact: boolean
  onMore: () => void
  onEdit: (r: FinanceRecord) => void
  onDelete: (r: FinanceRecord) => void
}) {
  return (
    <div className="row group">
      <Seal
        size={30}
        char={r.kind === 'income' ? '收' : '支'}
        tone={r.kind === 'income' ? 'teal' : 'cinnabar'}
        rotate={r.kind === 'income' ? -2 : 2}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-ink">{r.merchant || categoryLabel(r.category)}</span>
          <Badge tone="plain">{categoryLabel(r.category)}</Badge>
          {r.isPurchase && <Badge tone="bronze">购买</Badge>}
        </div>
        {(r.note || r.date) && (
          <div className="mt-0.5 flex gap-2 text-xs text-ink-faint">
            <span className="tabular">{r.date}</span>
            {r.note && <span className="truncate">{r.note}</span>}
          </div>
        )}
      </div>
      <span className={cn('tabular text-sm font-medium', r.kind === 'income' ? 'text-teal' : 'text-ink')}>
        {r.kind === 'income' ? '+' : '-'}{money(r.amount)}
      </span>
      {compact ? (
        <button
          onClick={onMore}
          className="touch-target flex items-center justify-center rounded-control text-ink-muted hover:bg-raised"
          aria-label="更多操作"
        >
          <MoreHorizontal size={16} />
        </button>
      ) : (
        <>
          <button
            className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised"
            onClick={() => useInspectorStore.getState().open('finance', r.id)}
            aria-label="详情"
          >
            <Eye size={13} />
          </button>
          <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => onEdit(r)} aria-label="编辑">
            <Pencil size={13} />
          </button>
          <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => onDelete(r)} aria-label="删除">
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
}

/** 统计 —— 月度预算（原「预算」页签并入） + 分类占比 + 收支概览 */
