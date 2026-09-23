/**
 * 财 · BuyTab（从 FinancePage 拆出，见 docs/编码规范.md 路线图第 4 步）
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
  BellRing,
  Package,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
} from 'lucide-react'
import { usePurchaseStore } from '../../stores/useFinanceStore'

import { FINANCE_CATEGORIES, categoryLabel } from '../../services/finance'

import { deliverNotice } from '../../components/notification/deliver'
import { playSound } from '../../services/sound'
import type { Purchase } from '../../types/entities'
import { createId, todayISO, nowISO } from '../../utils/id'
import { Seal } from '../../components/ui/Seal'
import { parseAmountAllowZero } from '../../utils/validate'
import { cn } from '../../utils/cn'
import { SummaryCell } from './shared'
import { money } from './summary'

import {
  Badge,
  Button,
  Chip,
  Dialog,
  EmptyState,
  Input,
  ScrollRow,
  Section,
  Select,
  useToast,
} from '../../components/ui'


/** 购买状态三态：想买 → 已下单/待取件 → 已到手 */
const BUY_STATUS: { key: Purchase['status']; label: string; desc: string }[] = [
  { key: 'want', label: '想买', desc: '收藏清单 · 还没下单' },
  { key: 'ordered', label: '待取', desc: '已下单 · 记得取件' },
  { key: 'done', label: '到手', desc: '已收到' },
]

export function BuyTab() {
  const purchases = usePurchaseStore((s) => s.items)
  const toast = useToast().toast
  const [status, setStatus] = useState<'all' | Purchase['status']>('all')
  const [buyOpen, setBuyOpen] = useState(false)
  const [editingBuy, setEditingBuy] = useState<Purchase | null>(null)
  const [buyForm, setBuyForm] = useState({
    title: '',
    price: '',
    category: 'shopping' as string | 'custom',
    customCategory: '',
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
    setBuyForm({ title: '', price: '', category: 'shopping', customCategory: '', url: '', note: '', status: 'want' })
    setBuyOpen(true)
  }
  const openEdit = (p: Purchase) => {
    setEditingBuy(p)
    const known = FINANCE_CATEGORIES.some((c) => c.value === p.category)
    setBuyForm({
      title: p.title,
      // 0 价（未定价）留空：避免输入框里出现一个会被判非法的 0
      price: p.price > 0 ? String(p.price) : '',
      category: known ? p.category : 'custom',
      customCategory: known ? '' : p.category,
      url: p.url ?? '',
      note: p.note ?? '',
      status: p.status ?? 'want',
    })
    setBuyOpen(true)
  }
  const save = async () => {
    // 价格非必填：想买清单可以只记"想买什么"，下单后再补价。
    // 这里必须用 parseAmountAllowZero —— parsePositiveAmount 把 "0" 判为非法，
    // 而编辑一个未定价的条目时输入框里正是 "0"，于是保存按钮永久禁用、连名字都改不了。
    const price = parseAmountAllowZero(buyForm.price)
    if (!buyForm.title.trim()) {
      toast('请填写商品名', 'danger')
      return
    }
    if (price === null) {
      toast('价格需为大于 0 的数字', 'danger')
      return
    }
    const finalCategory: string =
      buyForm.category === 'custom'
        ? buyForm.customCategory.trim() || '其他'
        : buyForm.category
    const now = nowISO()
    const prev = editingBuy
    const next: Purchase = {
      id: editingBuy?.id ?? createId(),
      title: buyForm.title.trim(),
      price,
      category: finalCategory,
      date: editingBuy?.date ?? todayISO(),
      url: buyForm.url.trim() || undefined,
      note: buyForm.note.trim() || undefined,
      status: buyForm.status,
      financeId: editingBuy?.financeId,
      createdAt: editingBuy?.createdAt ?? now,
    }
    await usePurchaseStore.getState().save(next)
    // 状态刚变为「待取」→ 提醒取件。走统一投递管线：**免打扰时段与"其他"源开关都管得住它**
    // （此前直接调 browserNotify，绕过总开关与免打扰 —— 夜里下单照样弹系统通知）
    if (next.status === 'ordered' && prev?.status !== 'ordered') {
      deliverNotice({
        source: 'other',
        title: '知白台 · 取件提醒',
        text: `「${next.title}」已下单，记得收快递取件`,
        hash: '#/finance',
        system: true,
        sound: true,
      })
    }
    setBuyOpen(false)
    playSound('purchase')
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
    await usePurchaseStore.getState().update(p.id, { status: nxt, updatedAt: nowISO() })
    if (nxt === 'ordered') {
      deliverNotice({
        source: 'other',
        title: '知白台 · 取件提醒',
        text: `「${p.title}」已下单，记得取件`,
        hash: '#/finance',
        system: true,
        sound: true,
      })
    }
    toast(nxt === 'ordered' ? '已标记下单 · 记得取件' : '已标记到手', 'success')
  }

  return (
    <div className="space-y-4">
      {/* 顶部概览：想买 / 待取件 / 合计
          窄屏（<400px）改为纵排：三列时每格内宽不足 90px，金额到五位数就撑破列 */}
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
        <SummaryCell label="想买清单" value={`${wantCount} 件`} tone="ink" />
        <SummaryCell label="待取快递" value={`${orderedCount} 件`} tone="bronze" />
        <SummaryCell label="合计" value={money(purchases.reduce((s, p) => s + p.price, 0))} tone="teal" />
      </div>

      <Section
        title="购买"
       
        action={
          <Button size="sm" variant="primary" onClick={openNew}>
            <Plus size={13} /> 添加
          </Button>
        }
      >
        <ScrollRow className="pb-2" activeSelector={'[data-active="true"]'} activeKey={status}>
          <Chip active={status === 'all'} onClick={() => setStatus('all')}>
            全部
          </Chip>
          {/* 不带计数：与「项目中心」的筛选保持同一形制
              （全站只有这排与藏品分类曾带数字徽标，两处并排看密度不同） */}
          {BUY_STATUS.map((s) => (
            <Chip key={s.key} active={status === s.key} onClick={() => setStatus(s.key)}>
              {s.label}
            </Chip>
          ))}
        </ScrollRow>

        {buyList.length > 0 ? (
          <div>
            {buyList.map((p) => {
              const st = p.status ?? 'want'
              return (
                <div key={p.id} className="row group">
                  <Seal size={30} char="购" rotate={-2} tone={st === 'done' ? 'teal' : st === 'ordered' ? 'bronze' : 'cinnabar'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* min-w-0：父容器 flex-wrap，长商品名 nowrap 会撑破行、把状态徽标挤出或溢出卡片 */}
                      <span className="min-w-0 truncate text-sm text-ink">{p.title}</span>
                      <Badge tone="plain">{categoryLabel(p.category)}</Badge>
                      <Badge tone={st === 'done' ? 'teal' : st === 'ordered' ? 'bronze' : 'plain'}>
                        {BUY_STATUS.find((s) => s.key === st)?.label}
                      </Badge>
                    </div>
                    {(p.note || p.date) && (
                      <div className="mt-0.5 flex gap-2 text-xs text-ink-faint">
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
                    className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised"
                    aria-label="编辑"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-cinnabar"
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
          <div className="mt-3 flex items-center gap-2 rounded-tile border border-bronze/30 bg-bronze/5 px-3 py-2 text-xs text-bronze">
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
            <Button variant="primary" onClick={save} disabled={!buyForm.title.trim() || parseAmountAllowZero(buyForm.price) === null}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input autoFocus placeholder="商品名" value={buyForm.title} onChange={(e) => setBuyForm({ ...buyForm, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" step="0.01" placeholder="价格（可留空）" value={buyForm.price} onChange={(e) => setBuyForm({ ...buyForm, price: e.target.value })} />
            {buyForm.category === 'custom' ? (
              <Input placeholder="自定义分类" value={buyForm.customCategory} onChange={(e) => setBuyForm({ ...buyForm, customCategory: e.target.value })} />
            ) : (
              <Select value={buyForm.category} onChange={(e) => setBuyForm({ ...buyForm, category: e.target.value as string | 'custom' })}>
                {FINANCE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                <option value="custom">自定义…</option>
              </Select>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-xs text-ink-faint">状态</div>
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

