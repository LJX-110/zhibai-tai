/**
 * 修 —— 斩三尸 / 身体 / 喝水 / 成长
 * 成长页只留「今日五维道行 + 等级」单屏信息：历史曲线/月份明细这类
 * 沉重建图下沉到「观」首页需要时再看，这里不堆图表 —— 少即是多。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：四个页签各自成文件放在 ./cultivate/ 下，
 * 本文件只留页头 + 页签切换 + 一个 tab 状态。
 */
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '../components/ui'
import { HabitTab } from './cultivate/HabitTab'
import { BodyTab } from './cultivate/BodyTab'
import { WaterTab } from './cultivate/WaterTab'
import { GrowthTab } from './cultivate/GrowthTab'

const TABS: TabItem[] = [
  { key: 'habit', label: '斩三尸' },
  { key: 'body', label: '身体' },
  { key: 'water', label: '喝水' },
  { key: 'growth', label: '成长' },
]

export function CultivatePage() {
  const [tab, setTab] = useState('habit')
  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="苟日新，日日新" title="修 · 修身" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />
      {tab === 'habit' && <HabitTab />}
      {tab === 'body' && <BodyTab />}
      {tab === 'water' && <WaterTab />}
      {tab === 'growth' && <GrowthTab />}
    </div>
  )
}
