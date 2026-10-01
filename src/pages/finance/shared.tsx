/**
 * 财 · 共享**子组件**（记账 / 购买 / 统计共用，从 FinancePage 拆出）
 *
 * ⚠️ 本文件**只导出组件**：金额格式化、台账筛选、月度汇总这些非组件已迁到 `./summary`
 * （组件与非组件同文件会让 Fast Refresh 失去完整性；那边也解释了几处重复定义的来龙去脉）。
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
import {
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useInspectorStore } from '../../components/inspector/inspector-store'

import { categoryLabel } from '../../services/finance'

import type { FinanceRecord } from '../../types/entities'
import { money } from '../../utils/money'
import { Seal } from '../../components/ui/Seal'
import { RowActions } from '../../components/ui/RowActions'

import { cn } from '../../utils/cn'
import { Badge } from '../../components/ui'

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
  onEdit,
  onDelete,
}: {
  r: FinanceRecord
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
      {/* 操作区走共用 `RowActions`（Step 5-2C C 批 · 用户拍板并入）。
          改前这里是"compact ? More : inline"两套写法各写一遍，而情报源那边又写了第三套、
          还多出一个只服务情报源的 MobileActionDialog —— 同一件事四份实现。
          业务逻辑（详情开 Inspector / 编辑 / 删除）**一个字没改**，只统一了交互实现。 */}
      <RowActions
        moreTitle={r.merchant || categoryLabel(r.category)}
        actions={[
          {
            key: 'detail',
            label: '详情',
            icon: Eye,
            onClick: () => useInspectorStore.getState().open('finance', r.id),
          },
          { key: 'edit', label: '编辑', icon: Pencil, onClick: () => onEdit(r) },
          { key: 'remove', label: '删除', icon: Trash2, onClick: () => onDelete(r), danger: true },
        ]}
      />
    </div>
  )
}

/** 统计 —— 月度预算（原「预算」页签并入） + 分类占比 + 收支概览 */
