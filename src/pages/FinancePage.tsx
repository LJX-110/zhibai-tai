/**
 * 财 —— 记账 / 购买 / 统计（外壳）
 *
 * 只负责页头、页签与分发；各 Tab 与共享片段独立在 `./finance/` 下
 * （原先 857 行、三个 Tab 函数全堆在一个文件里）。
 */
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '../components/ui'
import { BuyTab } from './finance/BuyTab'
import { LedgerTab } from './finance/LedgerTab'
import { StatsTab } from './finance/StatsTab'

const TABS: TabItem[] = [
  { key: 'ledger', label: '记账' },
  { key: 'buy', label: '购买' },
  // 预算并入「统计」，页签收窄：记账 / 购买 / 统计 三页，预算设置放统计页顶部
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
      {tab === 'stats' && <StatsTab />}
    </div>
  )
}

/** 本月汇总 */
