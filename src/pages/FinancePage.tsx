/**
 * 财 —— 收支 / 购买 / 预算 / 统计
 */
import { useMemo, useState } from 'react'
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts'
import { useBudgetStore, useFinanceStore, usePurchaseStore } from '../stores/useFinanceStore'
import { useInspectorStore } from '../components/inspector/Inspector'
import { FINANCE_CATEGORIES, categoryLabel } from '../services/finance'
import { recordActivity } from '../services/activity'
import type { FinanceCategory, FinanceRecord, Purchase } from '../types/entities'
import { createId, todayISO } from '../utils/id'
import { Seal } from '../components/ui/Seal'
import { parsePositiveAmount } from '../utils/validate'
import { cn } from '../utils/cn'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Progress,
  Section,
  Select,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui'

/** 图表配色跟随主题令牌（五行模块色，深浅主题自动切换） */
const PIE_COLORS = [
  'var(--module-1)',
  'var(--module-2)',
  'var(--module-3)',
  'var(--module-4)',
  'var(--module-5)',
  'var(--line-strong)',
  'var(--accent-deep)',
  'var(--cinnabar-light)',
]

const TABS: TabItem[] = [
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
  { key: 'purchase', label: '购买' },
  { key: 'budget', label: '预算' },
  { key: 'stats', label: '统计' },
]

const money = (n: number) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function FinancePage() {
  const [tab, setTab] = useState('month')
  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="君子爱财，取之有道" title="财 · 度支" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />
      {tab === 'month' && <MonthTab />}
      {tab === 'all' && <AllTab />}
      {tab === 'purchase' && <PurchaseTab />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'stats' && <StatsTab />}
    </div>
  )
}

/** 本月汇总 */
function useMonthSummary() {
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

/** 本月 */
function MonthTab() {
  const records = useFinanceStore((s) => s.items)
  const { income, expense, balance, budget, month } = useMonthSummary()
  const toast = useToast().toast
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceRecord | null>(null)
  const [form, setForm] = useState({
    kind: 'expense' as 'income' | 'expense',
    amount: '',
    category: 'dining' as FinanceCategory,
    merchant: '',
    note: '',
    isPurchase: false,
  })

  const recent = records
    .filter((r) => r.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)

  const openNew = () => {
    setEditing(null)
    setForm({ kind: 'expense', amount: '', category: 'dining', merchant: '', note: '', isPurchase: false })
    setEditorOpen(true)
  }
  const save = async () => {
    // P1：此前 `if (!amt) return` 静默拦截，负数照样入库且无提示
    const amt = parsePositiveAmount(form.amount)
    if (amt === null) {
      toast('金额需为大于 0 的数字', 'danger')
      return
    }
    const now = new Date().toISOString()
    const rec: FinanceRecord = {
      id: editing?.id ?? createId(),
      kind: form.kind,
      amount: amt,
      category: form.category,
      date: todayISO(),
      merchant: form.merchant.trim() || undefined,
      note: form.note.trim() || undefined,
      isPurchase: form.isPurchase,
      createdAt: editing?.createdAt ?? now,
    }
    await useFinanceStore.getState().save(rec)
    // 若是购买物品，同步到购买表
    if (rec.isPurchase) {
      await usePurchaseStore.getState().add({
        id: createId(),
        title: rec.merchant ?? rec.note ?? `消费 ${money(amt)}`,
        price: amt,
        category: rec.category,
        date: rec.date,
        note: rec.note,
        createdAt: now,
      })
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
          title="本月流水"
          hint={month}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={openNew}>
                <Plus size={13} /> 记一笔
              </Button>
            </div>
          }
        >
          {recent.length > 0 ? (
            <div>
              {recent.map((r) => (
                <FinanceRow key={r.id} r={r} onEdit={(x) => { setEditing(x); setForm({ kind: x.kind, amount: String(x.amount), category: x.category, merchant: x.merchant ?? '', note: x.note ?? '', isPurchase: x.isPurchase }); setEditorOpen(true) }} onDelete={remove} />
              ))}
            </div>
          ) : (
            <EmptyState title="本月尚无流水" desc="记下第一笔收支" action={<Button variant="primary" onClick={openNew}><Plus size={13} /> 记一笔</Button>} />
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
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-ink-muted">
                <span>预算使用</span>
                <span className="tabular">{Math.round((expense / budget) * 100)}%</span>
              </div>
              <Progress value={expense} max={budget} bronze={expense > budget * 0.8} />
            </div>
          )}
        </Section>
      </div>

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? '改流水' : '记一笔'}
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
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FinanceCategory })}>
              {FINANCE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>
          <Input placeholder="商家/来源（可选）" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
          <Input placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <Checkbox checked={form.isPurchase} onChange={(v) => setForm({ ...form, isPurchase: v })} />
            这是购买物品（同步到「购买」清单）
          </label>
        </div>
      </Dialog>
    </div>
  )
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone: 'cinnabar' | 'teal' | 'ink' | 'bronze' }) {
  const toneClass = { cinnabar: 'text-cinnabar', teal: 'text-teal', ink: 'text-ink', bronze: 'text-bronze' }[tone]
  return (
    <div className="rounded-paper bg-raised px-3 py-3">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className={cn('tabular mt-0.5 text-base font-semibold', toneClass)}>{value}</div>
    </div>
  )
}

function FinanceRow({ r, onEdit, onDelete, editable = true }: { r: FinanceRecord; onEdit: (r: FinanceRecord) => void; onDelete: (r: FinanceRecord) => void; editable?: boolean }) {
  // 收/支专用圆形符箓（印文收·支，印色随性质）
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
          <div className="mt-0.5 flex gap-2 text-[11px] text-ink-faint">
            <span className="tabular">{r.date}</span>
            {r.note && <span className="truncate">{r.note}</span>}
          </div>
        )}
      </div>
      <span className={cn('tabular text-sm font-medium', r.kind === 'income' ? 'text-teal' : 'text-ink')}>
        {r.kind === 'income' ? '+' : '-'}{money(r.amount)}
      </span>
      {editable && (
        <button
          className="rounded-control p-1.5 text-ink-muted opacity-0 hover:bg-raised group-hover:opacity-100"
          onClick={() => useInspectorStore.getState().open('finance', r.id)}
          aria-label="详情"
        >
          <Eye size={13} />
        </button>
      )}
      {editable && (
        <button className="rounded-control p-1.5 text-ink-muted opacity-0 hover:bg-raised group-hover:opacity-100" onClick={() => onEdit(r)} aria-label="编辑">
          <Pencil size={13} />
        </button>
      )}
      <button className="rounded-control p-1.5 text-ink-muted opacity-0 hover:bg-raised hover:text-cinnabar group-hover:opacity-100" onClick={() => onDelete(r)} aria-label="删除">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

/** 全部 */
function AllTab() {
  const records = useFinanceStore((s) => s.items)
  const toast = useToast().toast
  const [kind, setKind] = useState<'all' | 'income' | 'expense'>('all')
  const [month, setMonth] = useState(todayISO().slice(0, 7))

  const months = useMemo(() => {
    const set = new Set(records.map((r) => r.date.slice(0, 7)))
    return [...set].sort().reverse()
  }, [records])

  const list = records
    .filter((r) => kind === 'all' || r.kind === kind)
    .filter((r) => r.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  const remove = async (r: FinanceRecord) => {
    await useFinanceStore.getState().remove(r.id)
    toast('已删除')
  }

  return (
    <Section
      title="全部流水"
      hint={`${list.length} 条`}
      action={
        <div className="flex gap-2">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="!w-auto !py-1.5 text-sm">
            {months.length > 0 ? months.map((m) => <option key={m} value={m}>{m}</option>) : <option value={month}>{month}</option>}
          </Select>
          <div className="flex gap-1 rounded-tile bg-nested/50 p-0.5">
            {(['all', 'expense', 'income'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cn('rounded-control px-2 py-0.5 text-xs transition-colors', kind === k ? 'bg-paper text-ink' : 'text-ink-muted')}>
                {k === 'all' ? '全部' : k === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {list.length > 0 ? (
        <div>
          {list.map((r) => <FinanceRow key={r.id} r={r} onEdit={() => {}} onDelete={remove} editable={false} />)}
        </div>
      ) : (
        <EmptyState title="该月无流水" />
      )}
    </Section>
  )
}

/** 购买 */
function PurchaseTab() {
  const purchases = usePurchaseStore((s) => s.items)
  const toast = useToast().toast
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Purchase | null>(null)
  const [form, setForm] = useState({ title: '', price: '', category: 'shopping' as FinanceCategory, url: '', note: '' })

  const openNew = () => {
    setEditing(null)
    setForm({ title: '', price: '', category: 'shopping', url: '', note: '' })
    setOpen(true)
  }
  const save = async () => {
    const price = parsePositiveAmount(form.price)
    if (!form.title.trim()) {
      toast('请填写商品名', 'danger')
      return
    }
    if (price === null) {
      toast('价格需为大于 0 的数字', 'danger')
      return
    }
    const now = new Date().toISOString()
    await usePurchaseStore.getState().save({
      id: editing?.id ?? createId(),
      title: form.title.trim(),
      price,
      category: form.category,
      date: editing?.date ?? todayISO(),
      url: form.url.trim() || undefined,
      note: form.note.trim() || undefined,
      createdAt: editing?.createdAt ?? now,
    })
    setOpen(false)
    toast('已保存', 'success')
  }
  const remove = async (p: Purchase) => {
    await usePurchaseStore.getState().remove(p.id)
    toast('已删除')
  }

  const list = purchases.slice().sort((a, b) => b.date.localeCompare(a.date))
  const total = list.reduce((s, p) => s + p.price, 0)

  return (
    <Section
      title="购买清单"
      hint={`${list.length} 件 · 合计 ${money(total)}`}
      action={
        <Button size="sm" variant="primary" onClick={openNew}>
          <Plus size={13} /> 添加
        </Button>
      }
    >
      {list.length > 0 ? (
        <div>
          {list.map((p) => (
            <div key={p.id} className="row group">
              <Seal size={30} char="购" tone="bronze" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm text-ink">{p.title}</span>
                  <Badge tone="plain">{categoryLabel(p.category)}</Badge>
                </div>
                {(p.note || p.date) && (
                  <div className="mt-0.5 flex gap-2 text-[11px] text-ink-faint">
                    <span className="tabular">{p.date}</span>
                    {p.note && <span className="truncate">{p.note}</span>}
                  </div>
                )}
              </div>
              <span className="tabular text-sm font-medium text-ink">{money(p.price)}</span>
              <button className="rounded-control p-1.5 text-ink-muted opacity-0 hover:bg-raised group-hover:opacity-100" onClick={() => { setEditing(p); setForm({ title: p.title, price: String(p.price), category: p.category, url: p.url ?? '', note: p.note ?? '' }); setOpen(true) }} aria-label="编辑">
                <Pencil size={13} />
              </button>
              <button className="rounded-control p-1.5 text-ink-muted opacity-0 hover:bg-raised hover:text-cinnabar group-hover:opacity-100" onClick={() => remove(p)} aria-label="删除">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="还没有购买记录" action={<Button variant="primary" onClick={openNew}><Plus size={13} /> 添加</Button>} />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '改购买' : '记一件购买'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={!form.title.trim() || parsePositiveAmount(form.price) === null}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus placeholder="商品名" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" step="0.01" placeholder="价格" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FinanceCategory })}>
              {FINANCE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <Input placeholder="链接（可选）" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <Input placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </Dialog>
    </Section>
  )
}

/** 预算 */
function BudgetTab() {
  const budgets = useBudgetStore((s) => s.items)
  const { expense } = useMonthSummary()
  const month = todayISO().slice(0, 7)
  const current = budgets.find((b) => b.month === month)
  const [value, setValue] = useState(String(current?.amount ?? ''))
  const toast = useToast().toast

  const save = async () => {
    const amt = parsePositiveAmount(value)
    if (amt === null) {
      toast('预算需为大于 0 的数字', 'danger')
      return
    }
    const now = new Date().toISOString()
    await useBudgetStore.getState().save({
      id: current?.id ?? createId(),
      month,
      amount: amt,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    })
    toast('预算已保存', 'success')
  }

  return (
    <Section title="月度预算" hint={month}>
      <div className="max-w-md">
        <div className="flex items-center gap-2">
          <Input type="number" min={0} step={100} placeholder="本月预算（元）" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button variant="primary" onClick={save} disabled={parsePositiveAmount(value) === null}>保存</Button>
        </div>
        {current && current.amount > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-ink-muted">
              <span>已用 {money(expense)} / {money(current.amount)}</span>
              <span className="tabular">{Math.round((expense / current.amount) * 100)}%</span>
            </div>
            <Progress value={expense} max={current.amount} bronze={expense > current.amount * 0.8} />
            <p className="mt-2 text-[11px] text-ink-faint">
              {expense > current.amount ? '已超预算，留意支出。' : `剩余预算 ${money(current.amount - expense)}`}
            </p>
          </div>
        )}
      </div>
    </Section>
  )
}

/** 统计（Recharts） */
function StatsTab() {
  const records = useFinanceStore((s) => s.items)
  const month = todayISO().slice(0, 7)

  const byCategory = useMemo(() => {
    const map = new Map<FinanceCategory, number>()
    for (const r of records) {
      if (r.kind !== 'expense') continue
      map.set(r.category, (map.get(r.category) ?? 0) + r.amount)
    }
    return [...map.entries()]
      .map(([key, value]) => ({ name: categoryLabel(key), value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [records])

  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const out: { label: string; expense: number; income: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const inMonth = records.filter((r) => r.date.startsWith(key))
      out.push({
        label: `${d.getMonth() + 1}月`,
        expense: Math.round(inMonth.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0)),
        income: Math.round(inMonth.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0)),
      })
    }
    return out
  }, [records])

  return (
    <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <Section title="支出构成" hint="按分类">
          {byCategory.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} style={{ fill: PIE_COLORS[i % PIE_COLORS.length] }} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--color-paper)', border: '1px solid var(--color-line-strong)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {byCategory.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-ink-muted">{c.name}</span>
                    <span className="tabular ml-auto text-ink">{money(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="暂无支出数据" desc={month} />
          )}
        </Section>
      </div>
      <div className="lg:col-span-7">
        <Section title="月度趋势" hint="近 6 个月">
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} axisLine={{ stroke: 'var(--color-line)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-ink-faint)' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={{ background: 'var(--color-paper)', border: '1px solid var(--color-line-strong)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="expense" name="支出" fill="var(--color-cinnabar)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="income" name="收入" fill="var(--color-bronze)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>
    </div>
  )
}
