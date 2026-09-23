/**
 * 财 · LedgerTab（从 FinancePage 拆出，见 docs/编码规范.md 路线图第 4 步）
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
import {
  Eye,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useFinanceStore, usePurchaseStore } from '../../stores/useFinanceStore'
import { useInspectorStore } from '../../components/inspector/inspector-store'
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import { FINANCE_CATEGORIES, categoryLabel } from '../../services/finance'
import { recordActivity } from '../../services/activity'

import type { FinanceCategory, FinanceRecord } from '../../types/entities'
import { createId, todayISO, nowISO } from '../../utils/id'

import { parsePositiveAmount } from '../../utils/validate'
import { cn } from '../../utils/cn'
import { FinanceRow, SummaryCell } from './shared'
import { LEDGER_FILTERS, money, useMonthSummary, type LedgerFilter } from './summary'

import {
  Button,
  Chip,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  Progress,
  ScrollRow,
  Section,
  Select,
  useToast,
} from '../../components/ui'


export function LedgerTab() {
  const records = useFinanceStore((s) => s.items)
  const { income, expense, balance, budget } = useMonthSummary()
  const toast = useToast().toast
  const [filter, setFilter] = useState<LedgerFilter>('all')
  const [month, setMonth] = useState(todayISO().slice(0, 7))

  const compact = useResolvedLayout() === 'mobile'
  const pageSize = compact ? 10 : 20
  const [listLimit, setListLimit] = useState(pageSize)
  const [actionFor, setActionFor] = useState<FinanceRecord | null>(null)
  const listKey = `${filter}|${month}|${pageSize}`
  const [lastKey, setLastKey] = useState(listKey)
  if (listKey !== lastKey) {
    setLastKey(listKey)
    setListLimit(pageSize)
  }

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceRecord | null>(null)
  const [form, setForm] = useState({
    kind: 'expense' as 'income' | 'expense',
    amount: '',
    category: 'dining' as FinanceCategory | 'custom',
    customCategory: '',
    merchant: '',
    note: '',
    isPurchase: false,
  })

  const months = useMemo(() => {
    const set = new Set(records.map((r) => r.date.slice(0, 7)))
    return [...set].sort().reverse()
  }, [records])
  const monthOptions = useMemo(() => {
    const cur = todayISO().slice(0, 7)
    return months.includes(cur) ? months : [cur, ...months]
  }, [months])

  const list = useMemo(
    () =>
      records
        .filter((r) => month === 'all' || r.date.startsWith(month))
        .filter((r) => filter === 'all' || r.kind === filter)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [records, month, filter],
  )
  const shownList = list.slice(0, listLimit)

  const openNew = () => {
    setEditing(null)
    setForm({ kind: 'expense', amount: '', category: 'dining' as FinanceCategory | 'custom', customCategory: '', merchant: '', note: '', isPurchase: false })
    setEditorOpen(true)
  }
  const openEdit = (r: FinanceRecord) => {
    setEditing(r)
    const known = FINANCE_CATEGORIES.some((c) => c.value === r.category)
    setForm({
      kind: r.kind,
      amount: String(r.amount),
      category: known ? (r.category as FinanceCategory | 'custom') : 'custom',
      customCategory: known ? '' : r.category,
      merchant: r.merchant ?? '',
      note: r.note ?? '',
      isPurchase: r.isPurchase,
    })
    setEditorOpen(true)
  }
  const save = async () => {
    const amt = parsePositiveAmount(form.amount)
    if (amt === null) {
      toast('金额需为大于 0 的数字', 'danger')
      return
    }
    // 自定义分类：下拉选「自定义」时以输入值为准；未填则回落「其他」
    const finalCategory: string =
      form.category === 'custom'
        ? form.customCategory.trim() || '其他'
        : form.category
    const now = nowISO()
    const rec: FinanceRecord = {
      id: editing?.id ?? createId(),
      kind: form.kind,
      amount: amt,
      category: finalCategory,
      date: todayISO(),
      merchant: form.merchant.trim() || undefined,
      note: form.note.trim() || undefined,
      isPurchase: form.isPurchase,
      createdAt: editing?.createdAt ?? now,
    }
    await useFinanceStore.getState().save(rec)
    if (rec.isPurchase) {
      await usePurchaseStore.getState().add({
        id: createId(),
        title: rec.merchant ?? rec.note ?? `消费 ${money(amt)}`,
        price: amt,
        category: rec.category,
        date: rec.date,
        note: rec.note,
        status: 'ordered',
        financeId: rec.id,
        createdAt: now,
      })
    } else if (editing?.isPurchase) {
      const orphaned = usePurchaseStore
        .getState()
        .items.filter((p) => p.financeId === rec.id)
      for (const p of orphaned) await usePurchaseStore.getState().remove(p.id)
    }
    setEditorOpen(false)
    toast('已记录', 'success')
    void recordActivity({
      entityType: 'finance',
      entityId: rec.id,
      title: `${rec.kind === 'expense' ? '支出' : '收入'} ${money(amt)} · ${categoryLabel(rec.category)}`,
    })
  }
  const remove = async (r: FinanceRecord) => {
    await useFinanceStore.getState().remove(r.id)
    toast('已删除')
  }

  return (
    <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Section
          title="记账"
          hint={`${list.length} 条`}
          action={
            <Button size="sm" variant="primary" onClick={openNew}>
              <Plus size={13} /> 记一笔
            </Button>
          }
        >
          {/* 筛选栏：类型标签 + 月份下拉同一行，避免日期独立悬浮显得突兀 */}
          <div className="flex items-center gap-2 pb-3">
            <ScrollRow className="min-w-0 flex-1 pb-0" activeSelector={'[data-active="true"]'} activeKey={filter}>
              {LEDGER_FILTERS.map((f) => (
                <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label}
                </Chip>
              ))}
            </ScrollRow>
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="!w-auto !shrink-0 !py-1.5 text-sm"
            >
              <option value="all">全部月份</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>

          {list.length > 0 ? (
            <div>
              {shownList.map((r) => (
                <FinanceRow
                  key={r.id}
                  r={r}
                  compact={compact}
                  onMore={() => setActionFor(r)}
                  onEdit={openEdit}
                  onDelete={remove}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="该范围内无流水" desc="记下第一笔收支" action={<Button variant="primary" onClick={openNew}><Plus size={13} /> 记一笔</Button>} />
          )}

          {listLimit < list.length && (
            <div className="pt-2">
              <Button variant="secondary" className="w-full" onClick={() => setListLimit((n) => n + pageSize)}>
                加载更多（已显示 {shownList.length} / {list.length}）
              </Button>
            </div>
          )}
        </Section>
      </div>

      <div className="lg:col-span-5">
        <Section title="本月概览">
          <div className="grid grid-cols-2 gap-2">
            <SummaryCell label="支出" value={money(expense)} tone="cinnabar" />
            <SummaryCell label="收入" value={money(income)} tone="teal" />
            <SummaryCell label="结余" value={money(balance)} tone="ink" />
            <SummaryCell
              label="预算剩余"
              value={budget ? money(Math.max(0, budget - expense)) : '未设'}
              tone="bronze"
            />
          </div>
          {budget > 0 && (
            <div className="mt-3 rounded-paper bg-raised px-3 py-2.5">
              <div className="mb-1 flex justify-between text-xs text-ink-muted">
                <span>本月预算</span>
                <span className="tabular">{Math.min(100, Math.round((expense / budget) * 100))}%</span>
              </div>
              <Progress value={expense} max={budget} bronze={expense > budget * 0.8} />
            </div>
          )}
        </Section>
      </div>

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? '改记账' : '记一笔'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setEditorOpen(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={parsePositiveAmount(form.amount) === null}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setForm({ ...form, kind: k })}
                className={cn(
                  'rounded-tile border px-3 py-2 text-sm transition-colors',
                  form.kind === k ? 'border-cinnabar/50 bg-cinnabar/5 text-ink' : 'border-line text-ink-muted',
                )}
              >
                {k === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input autoFocus type="number" step="0.01" placeholder="金额" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            {form.category === 'custom' ? (
              <Input placeholder="自定义分类" value={form.customCategory} onChange={(e) => setForm({ ...form, customCategory: e.target.value })} />
            ) : (
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FinanceCategory | 'custom' })}>
                {FINANCE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
                <option value="custom">自定义…</option>
              </Select>
            )}
          </div>
          <Input placeholder="商家/来源（可选）" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
          <Input placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <Checkbox checked={form.isPurchase} onChange={(v) => setForm({ ...form, isPurchase: v })} />
            这是购买物品（同步到「购买」清单）
          </label>
        </div>
      </Dialog>

      <Dialog
        open={actionFor != null}
        onClose={() => setActionFor(null)}
        title={actionFor ? actionFor.merchant || categoryLabel(actionFor.category) : ''}
      >
        {actionFor && (
          <div className="space-y-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                const x = actionFor
                setActionFor(null)
                useInspectorStore.getState().open('finance', x.id)
              }}
            >
              <Eye size={14} /> 详情
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                const x = actionFor
                setActionFor(null)
                openEdit(x)
              }}
            >
              <Pencil size={14} /> 编辑
            </Button>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                const x = actionFor
                setActionFor(null)
                void remove(x)
              }}
            >
              <Trash2 size={14} /> 删除
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  )
}

/** 购买 —— 想买清单 + 待取快递提醒 */
