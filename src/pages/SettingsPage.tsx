/**
 * 系统 —— 设置页外壳
 *
 * 只负责三件事：页头 + 分组导航 + 分发到四个分组组件。
 * 四组的具体实现各自独立在 `./settings/` 下，**状态跟着分组走**（各组件自己读 store，不做 prop 传递）——
 * 拆分的目的是让每个文件都能一眼读完：原先这里是 1260 行、四个分组的 JSX 全堆在一个函数里。
 */
import { useState } from 'react'
import { PageHeader, ScrollRow } from '../components/ui'
import { APP_VERSION } from '../app/version'
import { cn } from '../utils/cn'
import { AppearanceGroup } from './settings/AppearanceGroup'
import { AiGroup } from './settings/AiGroup'
import { DataGroup } from './settings/DataGroup'
import { SyncGroup } from './settings/SyncGroup'

type SettingsGroup = 'appearance' | 'ai' | 'data' | 'sync'

/** 设置分组：四组语义导航，替代 15+ 区块长滚动。
 *  标签按「组里到底装了什么」命名 —— 智能组同时装着 AI Core 与情报源，
 *  只挂「智能」会让人在情报源出问题时想不到来这里找。 */
const SETTINGS_GROUPS: { key: SettingsGroup; label: string }[] = [
  { key: 'appearance', label: '外观 · 目标' },
  { key: 'ai', label: '智能 · 情报' },
  { key: 'data', label: '数据' },
  { key: 'sync', label: '同步' },
]

/* 分类管理不在这里：情报分类与藏阁分类都在各自页面的页签行尾「+」就地增删
   （分类是业务表 categories，随快照跨设备同步，不再是设置项）。 */

export function SettingsPage() {
  const [group, setGroup] = useState<SettingsGroup>('appearance')

  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="大象无形" title="系统 · 配置" />
      {/* 分组导航：一次点击定位任一设置。
          横滑行复用 ScrollRow —— 四个药丸在 375px 上已贴边，
          系统字号一放大就会溢出，而溢出必须自带「右边还有」的暗示。 */}
      <ScrollRow
        className="switch-pill mb-5 rounded-tile p-0.5"
        activeSelector={'[data-active="true"]'}
        activeKey={group}
      >
        {SETTINGS_GROUPS.map((g) => (
          <button
            key={g.key}
            data-active={group === g.key || undefined}
            onClick={() => setGroup(g.key)}
            className={cn(
              // 与 Chip 统一形制：本行是 switch-pill 分段控件，选中态是外层共享的黛蓝实底（.switch-pill-active），
              // 与 Chip 逐按钮 bg-ink 不同，故不直接用 <Chip>，只对齐尺寸/圆角（px-3 py-1.5 text-sm rounded-tile）
              'shrink-0 rounded-tile px-3 py-1.5 text-sm transition-colors',
              group === g.key ? 'switch-pill-active' : 'text-ink-muted hover:text-ink',
            )}
          >
            {g.label}
          </button>
        ))}
      </ScrollRow>

      {group === 'appearance' && <AppearanceGroup />}
      {group === 'ai' && <AiGroup />}
      {group === 'data' && <DataGroup />}
      {group === 'sync' && <SyncGroup />}

      <p className="py-6 text-center eyebrow text-ink-faint">
        知白台 v{APP_VERSION} · Local-first
      </p>
    </div>
  )
}
