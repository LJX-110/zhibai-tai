/**
 * 奇 —— 抽签 / 梅花 / 大衍 / 历史 四个页签
 *
 * 功能一项未减，只是从「一屏平铺七个 Section」改为按事分层：
 * 手机上先把当下要做的那件事放到首屏，其余收进对应页签。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：本文件只留页头 + 页签切换 +
 * 一个 tab 状态；四个页签各自成文件放在 ./occult/ 下，**状态与逻辑随页签一起走**
 * （对外零 props，与设置页分组的拆法一致）。
 */
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '../components/ui'
import { SignTab } from './occult/SignTab'
import { MeihuaTab } from './occult/MeihuaTab'
import { DayanTab } from './occult/DayanTab'
import { HistoryTab } from './occult/HistoryTab'

/**
 * 四个语义分组：抽签（每日惯例）/ 梅花 / 大衍 / 历史。
 * 原先七个 Section 平铺一屏，手机上要滚三四屏才够得着「大衍」或存档，
 * 分组后每屏只服务一件事；页签本身复用 Tabs 的右缘渐隐 + 选中项居中。
 */
const TABS: TabItem[] = [
  { key: 'sign', label: '抽签' },
  { key: 'meihua', label: '梅花' },
  { key: 'dayan', label: '大衍' },
  { key: 'history', label: '历史' },
]

export function OccultPage() {
  const [tab, setTab] = useState('sign')

  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      {/* 页头：与其他板块统一 */}
      <PageHeader poem="阴阳不测之谓神" title="奇 · 玄机" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'sign' && <SignTab />}
      {tab === 'meihua' && <MeihuaTab />}
      {tab === 'dayan' && <DayanTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  )
}
