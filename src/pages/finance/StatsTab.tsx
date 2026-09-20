/**
 * 财 · StatsTab（从 FinancePage 拆出，见 docs/编码规范.md 路线图第 4 步）
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
import { useMemo, useState } from 'react'

import { useBudgetStore, useFinanceStore } from '../../stores/useFinanceStore'

import { categoryLabel } from '../../services/finance'

import type { FinanceCategory } from '../../types/entities'
import { createId, todayISO, nowISO } from '../../utils/id'
import { Ring } from '../../components/ui/Ring'

import { parsePositiveAmount } from '../../utils/validate'

import { SummaryCell, useMonthSummary } from './shared'

import {
  Button,
  EmptyState,
  Input,
  Section,
  useToast,
} from '../../components/ui'

const money = (n: number) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function StatsTab() {
  const records = useFinanceStore((s) => s.items)
  const month = todayISO().slice(0, 7)
  const budgets = useBudgetStore((s) => s.items)
  const { income, expense } = useMonthSummary()
  const current = budgets.find((b) => b.month === month)
  const [value, setValue] = useState(String(current?.amount ?? ''))
  const toast = useToast().toast

  /** 保存月度预算 */
  const saveBudget = async () => {
    const amt = parsePositiveAmount(value)
    if (amt === null) {
      toast('预算需为大于 0 的数字', 'danger')
      return
    }
    const now = nowISO()
    await useBudgetStore.getState().save({
      id: current?.id ?? createId(),
      month,
      amount: amt,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    })
    toast('预算已保存', 'success')
  }

  const usedPct = current && current.amount > 0 ? Math.min(100, (expense / current.amount) * 100) : 0

  const byCategory = useMemo(() => {
    const map = new Map<FinanceCategory, number>()
    // 只统计当月支出：此前不过滤月份，历史月份的数值混进「本月支出」标题下
    for (const r of records) {
      if (r.kind !== 'expense' || !r.date.startsWith(month)) continue
      map.set(r.category, (map.get(r.category) ?? 0) + r.amount)
    }
    return [...map.entries()]
      .map(([key, value]) => ({ name: categoryLabel(key), value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [records, month])

  const expenseTotal = byCategory.reduce((s, c) => s + c.value, 0)

  /** 圆环配色：主环用当月支出总额，占比按分类逐段着色（CSS 变量跟随主题） */
  const RING_COLORS = [
    'var(--module-1)',
    'var(--module-2)',
    'var(--module-3)',
    'var(--module-4)',
    'var(--module-5)',
    'var(--line-strong)',
    'var(--accent-deep)',
    'var(--cinnabar-light)',
  ]

  return (
    <div className="space-y-[var(--section-gap)]">
      <Section title="月度预算" hint={month}>
        <div className="max-w-md">
          <div className="flex items-center gap-2">
            <Input type="number" min={0} step={100} placeholder="本月预算（元）" value={value} onChange={(e) => setValue(e.target.value)} />
            <Button variant="primary" onClick={saveBudget} disabled={parsePositiveAmount(value) === null}>保存</Button>
          </div>
          {current && current.amount > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <Ring percent={usedPct} size={104} stroke={8}>
                <span className="tabular text-lg font-semibold text-ink">{Math.round(usedPct)}%</span>
                {/* 环内文字用 12px（不是刻意压小）：内圈可用宽约 76px，「已用」两字约 24px，
                    与上方 18px 数值合计 44px 高，都在 ⌀88px 的内圈里 */}
                <span className="text-xs text-ink-faint">已用</span>
              </Ring>
              <div className="flex-1 text-sm text-ink-muted">
                <div className="flex justify-between gap-2">
                  <span>已用 {money(expense)} / {money(current.amount)}</span>
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  {expense > current.amount ? '已超预算，留意支出。' : `剩余预算 ${money(current.amount - expense)}`}
                </p>
              </div>
            </div>
          )}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Section title="本月支出" hint={month}>
            {expenseTotal > 0 ? (
              <div className="flex items-center gap-5">
                <Ring percent={income > 0 ? Math.min(100, (expenseTotal / income) * 100) : 0} size={120} stroke={10}>
                  <span className="tabular text-lg font-semibold text-ink">¥{expenseTotal.toLocaleString()}</span>
                  {/* 同上：⌀100px 内圈，「共支出」3 字在 12px 下约 36px，远未触到圆边 */}
                  <span className="text-xs text-ink-faint">共支出</span>
                </Ring>
                <div className="flex-1 space-y-1.5">
                  {byCategory.slice(0, 5).map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: RING_COLORS[i % RING_COLORS.length] }} />
                      <span className="text-ink-muted">{c.name}</span>
                      <span className="tabular ml-auto text-ink">{money(c.value)}</span>
                      <span className="tabular w-9 text-right text-xs text-ink-faint">
                        {Math.round((c.value / expenseTotal) * 100)}%
                      </span>
                    </div>
                  ))}
                  {byCategory.length > 5 && (
                    <p className="pt-1 text-xs text-ink-faint">另有 {byCategory.length - 5} 个分类未展示</p>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState title="暂无支出数据" desc={month} />
            )}
          </Section>
        </div>

        <div className="lg:col-span-7">
          <Section title="收支概览" hint="本月">
            <div className="grid grid-cols-2 gap-3">
              <SummaryCell label="收入" value={money(income)} tone="teal" />
              <SummaryCell label="支出" value={money(expenseTotal)} tone="cinnabar" />
              <SummaryCell label="结余" value={money(income - expenseTotal)} tone="ink" />
              <SummaryCell label="记录数" value={`${records.length} 条`} tone="bronze" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              {income > 0
                ? `结余率 ${Math.round(((income - expenseTotal) / income) * 100)}%${expenseTotal > income ? '，支出已超收入' : '，总体健康'}`
                : '记下收入后即可看到结余率'}
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}