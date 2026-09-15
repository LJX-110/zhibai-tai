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
import { BellRing, Eye, MoreHorizontal, Package, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useBudgetStore, useFinanceStore, usePurchaseStore } from '../stores/useFinanceStore'
import { useInspectorStore } from '../components/inspector/Inspector'
import { useResolvedLayout } from '../layouts/useResolvedLayout'
import { FINANCE_CATEGORIES, categoryLabel } from '../services/finance'
import { recordActivity } from '../services/activity'
import { browserNotify } from '../services/notification'
import type { FinanceCategory, FinanceRecord, Purchase } from '../types/entities'
import { createId, todayISO } from '../utils/id'
import { Ring } from '../components/ui/Ring'
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
  ScrollRow,
  Section,
  Select,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui'

const money = (n: number) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 购买状态三态：想买 → 已下单/待取件 → 已到手 */
const BUY_STATUS: { key: Purchase['status']; label: string; desc: string }[] = [
  { key: 'want', label: '想买', desc: '收藏清单 · 还没下单' },
  { key: 'ordered', label: '待取', desc: '已下单 · 记得取件' },
  { key: 'done', label: '到手', desc: '已收到' },
]

const TABS: TabItem[] = [
  { key: 'ledger', label: '记账' },
  { key: 'buy', label: '购买' },
  { key: 'budget', label: '预算' },
  { key: 'stats', label: '统计' },
]

export function FinancePage() {
  const [tab, setTab] = useState('ledger')
  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="君子爱财，取之有道" title="财 · 度支" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />
      {tab === 'ledger' && <LedgerTab />}
      {tab === 'buy' && <BuyTab />}
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

type LedgerFilter = 'all' | 'expense' | 'income'

const LEDGER_FILTERS: { key: LedgerFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
]

/** 记账 —— 收支同源一屏，购买物品照常入账（勾选后同步进购买清单） */
function LedgerTab() {
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
    category: 'dining' as FinanceCategory,
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
    setForm({ kind: 'expense', amount: '', category: 'dining', merchant: '', note: '', isPurchase: false })
    setEditorOpen(true)
  }
  const openEdit = (r: FinanceRecord) => {
    setEditing(r)
    setForm({
      kind: r.kind,
      amount: String(r.amount),
      category: r.category,
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
          <ScrollRow className="pb-2" activeSelector={'[data-active="true"]'} activeKey={filter}>
            {LEDGER_FILTERS.map((f) => (
              <button
                key={f.key}
                data-active={filter === f.key || undefined}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
                  filter === f.key ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
                )}
              >
                {f.label}
              </button>
            ))}
          </ScrollRow>

          <div className="pb-3">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="!w-auto !py-1.5 text-sm"
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
function BuyTab() {
  const purchases = usePurchaseStore((s) => s.items)
  const toast = useToast().toast
  const [status, setStatus] = useState<'all' | Purchase['status']>('all')
  const [buyOpen, setBuyOpen] = useState(false)
  const [editingBuy, setEditingBuy] = useState<Purchase | null>(null)
  const [buyForm, setBuyForm] = useState({
    title: '',
    price: '',
    category: 'shopping' as FinanceCategory,
    url: '',
    note: '',
    status: 'want' as Purchase['status'],
  })

  const buyList = useMemo(() => {
    const sorted = purchases.slice().sort((a, b) => b.date.localeCompare(a.date))
    return status === 'all' ? sorted : sorted.filter((p) => (p.status ?? 'want') === status)
  }, [purchases, status])

  const orderedCount = purchases.filter((p) => p.status === 'ordered').length
  const wantCount = purchases.filter((p) => !p.status || p.status === 'want').length

  const openNew = () => {
    setEditingBuy(null)
    setBuyForm({ title: '', price: '', category: 'shopping', url: '', note: '', status: 'want' })
    setBuyOpen(true)
  }
  const openEdit = (p: Purchase) => {
    setEditingBuy(p)
    setBuyForm({
      title: p.title,
      price: String(p.price),
      category: p.category,
      url: p.url ?? '',
      note: p.note ?? '',
      status: p.status ?? 'want',
    })
    setBuyOpen(true)
  }
  const save = async () => {
    const price = parsePositiveAmount(buyForm.price)
    if (!buyForm.title.trim()) {
      toast('请填写商品名', 'danger')
      return
    }
    if (price === null) {
      toast('价格需为大于 0 的数字', 'danger')
      return
    }
    const now = new Date().toISOString()
    const prev = editingBuy
    const next: Purchase = {
      id: editingBuy?.id ?? createId(),
      title: buyForm.title.trim(),
      price,
      category: buyForm.category,
      date: editingBuy?.date ?? todayISO(),
      url: buyForm.url.trim() || undefined,
      note: buyForm.note.trim() || undefined,
      status: buyForm.status,
      financeId: editingBuy?.financeId,
      createdAt: editingBuy?.createdAt ?? now,
    }
    await usePurchaseStore.getState().save(next)
    // 状态刚变为「待取」→ 提醒取件（浏览器通知 + 应用内 toast 双保险）
    if (next.status === 'ordered' && prev?.status !== 'ordered') {
      void browserNotify('知白台 · 取件提醒', `「${next.title}」已下单，记得收快递取件`)
    }
    setBuyOpen(false)
    toast(prev ? '已更新' : '已记入想买清单', 'success')
  }
  const remove = async (p: Purchase) => {
    await usePurchaseStore.getState().remove(p.id)
    toast('已删除')
  }
  /** 状态快捷流转：想买→下单（提醒）/ 下单→到手 */
  const advance = async (p: Purchase) => {
    const cur = p.status ?? 'want'
    const nxt: Purchase['status'] = cur === 'want' ? 'ordered' : cur === 'ordered' ? 'done' : 'done'
    await usePurchaseStore.getState().update(p.id, { status: nxt, updatedAt: new Date().toISOString() })
    if (nxt === 'ordered') void browserNotify('知白台 · 取件提醒', `「${p.title}」已下单，记得取件`)
    toast(nxt === 'ordered' ? '已标记下单 · 记得取件' : '已标记到手', 'success')
  }

  return (
    <div className="space-y-4">
      {/* 顶部概览：想买 / 待取件 / 合计 */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCell label="想买清单" value={`${wantCount} 件`} tone="ink" />
        <SummaryCell label="待取快递" value={`${orderedCount} 件`} tone="bronze" />
        <SummaryCell label="合计" value={money(purchases.reduce((s, p) => s + p.price, 0))} tone="teal" />
      </div>

      <Section
        title="购买"
        hint="记录想买的 · 追踪到手"
        action={
          <Button size="sm" variant="primary" onClick={openNew}>
            <Plus size={13} /> 添加
          </Button>
        }
      >
        <ScrollRow className="pb-2" activeSelector={'[data-active="true"]'} activeKey={status}>
          <button
            data-active={status === 'all' || undefined}
            onClick={() => setStatus('all')}
            className={cn(
              'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
              status === 'all' ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
            )}
          >
            全部
          </button>
          {BUY_STATUS.map((s) => (
            <button
              key={s.key}
              data-active={status === s.key || undefined}
              onClick={() => setStatus(s.key)}
              className={cn(
                'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
                status === s.key ? 'bg-ink text-on-dark' : 'bg-raised text-ink-muted hover:text-ink',
              )}
            >
              {s.label}
              <span className="ml-1 tabular text-[11px] opacity-60">
                {purchases.filter((p) => (p.status ?? 'want') === s.key).length}
              </span>
            </button>
          ))}
        </ScrollRow>

        {buyList.length > 0 ? (
          <div>
            {buyList.map((p) => {
              const st = p.status ?? 'want'
              return (
                <div key={p.id} className="row group">
                  <Seal size={30} char="购" tone={st === 'done' ? 'teal' : st === 'ordered' ? 'bronze' : 'cinnabar'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm text-ink">{p.title}</span>
                      <Badge tone="plain">{categoryLabel(p.category)}</Badge>
                      <Badge tone={st === 'done' ? 'teal' : st === 'ordered' ? 'bronze' : 'plain'}>
                        {BUY_STATUS.find((s) => s.key === st)?.label}
                      </Badge>
                    </div>
                    {(p.note || p.date) && (
                      <div className="mt-0.5 flex gap-2 text-[11px] text-ink-faint">
                        <span className="tabular">{p.date}</span>
                        {p.note && <span className="truncate">{p.note}</span>}
                      </div>
                    )}
                  </div>
                  <span className="tabular text-sm font-medium text-ink">{money(p.price)}</span>
                  {st !== 'done' && (
                    <button
                      onClick={() => void advance(p)}
                      className="shrink-0 rounded-control px-2 py-1 text-xs text-teal transition-colors hover:bg-teal/10"
                      aria-label={st === 'want' ? '标记下单' : '标记到手'}
                      title={st === 'want' ? '下单了 · 提醒取件' : '已到手'}
                    >
                      {st === 'want' ? <ShoppingCart size={13} /> : <Package size={13} />}
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(p)}
                    className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised"
                    aria-label="编辑"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-cinnabar"
                    aria-label="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title={status === 'all' ? '还没有购买记录' : '该状态暂无记录'}
            desc="记录想买的东西，下单后标记待取，到了不会忘"
            action={<Button variant="primary" onClick={openNew}><Plus size={13} /> 添加</Button>}
          />
        )}

        {orderedCount > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-tile border border-bronze/30 bg-bronze/5 px-3 py-2 text-[12px] text-bronze">
            <BellRing size={13} className="shrink-0" />
            有 {orderedCount} 件等待取件，到手后点「✓」完成
          </div>
        )}
      </Section>

      <Dialog
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        title={editingBuy ? '改购买' : '记一件想买的'}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setBuyOpen(false)}>取消</Button>
            <Button variant="primary" onClick={save} disabled={!buyForm.title.trim() || parsePositiveAmount(buyForm.price) === null}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus placeholder="商品名" value={buyForm.title} onChange={(e) => setBuyForm({ ...buyForm, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" step="0.01" placeholder="价格（必填）" value={buyForm.price} onChange={(e) => setBuyForm({ ...buyForm, price: e.target.value })} />
            <Select value={buyForm.category} onChange={(e) => setBuyForm({ ...buyForm, category: e.target.value as FinanceCategory })}>
              {FINANCE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] text-ink-faint">状态</div>
            <div className="grid grid-cols-3 gap-2">
              {BUY_STATUS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setBuyForm({ ...buyForm, status: s.key })}
                  className={cn(
                    'rounded-tile border px-2 py-1.5 text-xs transition-colors',
                    buyForm.status === s.key ? 'border-cinnabar/50 bg-cinnabar/5 text-ink' : 'border-line text-ink-muted',
                  )}
                  title={s.desc}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <Input placeholder="链接（可选）" value={buyForm.url} onChange={(e) => setBuyForm({ ...buyForm, url: e.target.value })} />
          <Input placeholder="备注（可选）" value={buyForm.note} onChange={(e) => setBuyForm({ ...buyForm, note: e.target.value })} />
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

function FinanceRow({
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
          <div className="mt-0.5 flex gap-2 text-[11px] text-ink-faint">
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
            className="rounded-control p-1.5 text-ink-muted hover:bg-raised"
            onClick={() => useInspectorStore.getState().open('finance', r.id)}
            aria-label="详情"
          >
            <Eye size={13} />
          </button>
          <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => onEdit(r)} aria-label="编辑">
            <Pencil size={13} />
          </button>
          <button className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => onDelete(r)} aria-label="删除">
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
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

  const usedPct = current && current.amount > 0 ? Math.min(100, (expense / current.amount) * 100) : 0

  return (
    <Section title="月度预算" hint={month}>
      <div className="max-w-md">
        <div className="flex items-center gap-2">
          <Input type="number" min={0} step={100} placeholder="本月预算（元）" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button variant="primary" onClick={save} disabled={parsePositiveAmount(value) === null}>保存</Button>
        </div>
        {current && current.amount > 0 && (
          <div className="mt-4 flex items-center gap-4">
            <Ring percent={usedPct} size={104} stroke={8}>
              <span className="tabular text-lg font-semibold text-ink">{Math.round(usedPct)}%</span>
              <span className="text-[10px] text-ink-faint">已用</span>
            </Ring>
            <div className="flex-1 text-sm text-ink-muted">
              <div className="flex justify-between gap-2">
                <span>已用 {money(expense)} / {money(current.amount)}</span>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                {expense > current.amount ? '已超预算，留意支出。' : `剩余预算 ${money(current.amount - expense)}`}
              </p>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

/** 统计 —— 分类占比用圆环：一眼看懂钱花在哪 */
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

  const expenseTotal = byCategory.reduce((s, c) => s + c.value, 0)
  const { income } = useMonthSummary()

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
    <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <Section title="本月支出" hint={month}>
          {expenseTotal > 0 ? (
            <div className="flex items-center gap-5">
              <Ring percent={income > 0 ? Math.min(100, (expenseTotal / income) * 100) : 0} size={120} stroke={10}>
                <span className="tabular text-lg font-semibold text-ink">¥{expenseTotal.toLocaleString()}</span>
                <span className="text-[10px] text-ink-faint">共支出</span>
              </Ring>
              <div className="flex-1 space-y-1.5">
                {byCategory.slice(0, 5).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: RING_COLORS[i % RING_COLORS.length] }} />
                    <span className="text-ink-muted">{c.name}</span>
                    <span className="tabular ml-auto text-ink">{money(c.value)}</span>
                    <span className="tabular w-9 text-right text-[11px] text-ink-faint">
                      {Math.round((c.value / expenseTotal) * 100)}%
                    </span>
                  </div>
                ))}
                {byCategory.length > 5 && (
                  <p className="pt-1 text-[11px] text-ink-faint">另有 {byCategory.length - 5} 个分类未展示</p>
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
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            {income > 0
              ? `结余率 ${Math.round(((income - expenseTotal) / income) * 100)}%${expenseTotal > income ? '，支出已超收入' : '，总体健康'}`
              : '记下收入后即可看到结余率'}
          </p>
        </Section>
      </div>
    </div>
  )
}