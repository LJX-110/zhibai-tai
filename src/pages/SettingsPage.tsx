/**
 * 系统 —— 设置页外壳
 *
 * 只负责三件事：页头 + 分组导航 + 分发到五个分组组件。
 * 各组的具体实现独立在 `./settings/` 下，**状态跟着分组走**（各组件自己读 store，不做 prop 传递）——
 * 拆分的目的是让每个文件都能一眼读完：原先这里是 1260 行、四个分组的 JSX 全堆在一个函数里。
 */
import { useEffect, useState } from 'react'
import { Collapse, PageHeader, ScrollRow } from '../components/ui'
import { APP_VERSION } from '../app/version'
import { cn } from '../utils/cn'
import { AppearanceGroup } from './settings/AppearanceGroup'
import { AlertsGroup } from './settings/AlertsGroup'
import { PetSettingsGroup } from './settings/PetSettingsGroup'
import { AiGroup } from './settings/AiGroup'
import { DataGroup } from './settings/DataGroup'
import { SyncGroup } from './settings/SyncGroup'
import { ProxyConfig, SourceManager } from '../components/source/SourceManager'
import { onSettingsGroupRequest, type SettingsGroup } from '../services/settings-intent'

/**
 * 设置分组（Step 5-2 重整）
 *
 * ## 归组原则：按「它管什么」，不按「当初写在哪个文件」
 *   · **外观** —— 长相与我的参数：昵称 / 主题 / 布局 / 目标 / 番茄钟 / 安装
 *   · **提醒** —— 叫不叫、怎么叫：音效 / 音量 / 通知 / 免打扰 / 每源开关
 *   · **桌宠** —— 那只宠物的开关、尺寸、漫游（用户明确要求单开）
 *   · **天机** —— 中枢本身：模型与连接 / AI 人设 / AI 记忆（2026-10-01 三段定稿）
 *   · **数据** —— 我的数据资产：导入导出 / 清空 / 统计 / 故障流水 / 跨设备同步 / 情报源与代理
 *
 * ## 这一版改了什么（为什么原来"乱"）
 * 上一版只有四组，而「外观 · 目标」一组里塞了 10 段：从昵称、PWA 安装、主题、布局、
 * 目标，一直到音效、通知、**桌宠**、**故障流水** —— 后三件跟"外观"没有关系，
 * 于是"想关掉某个提醒"和"想看故障记录"都得先猜它在「外观」里。
 *
 * 标签按「组里到底装了什么」命名（沿用上一版的做法）：数据组同时装着备份、同步
 * 与情报源 —— 只挂一个词会让人在另一件事出问题时想不到来这里。
 */
const SETTINGS_GROUPS: { key: SettingsGroup; label: string }[] = [
  // 名称**固定为两个字**（2026-09-29 用户拍板）：长名（外观 · 目标 / 提醒 · 音效 / 数据 · 同步）
  // 让五个药丸总宽 404px，390px 屏上必须横滑且首组被裁 —— 而"组里装了什么"由组内 Section 标题承担，
  // 不该压在导航药丸上。
  // 顺序 = 用户拍板的最终顺序（2026-09-30）：外观 · 桌宠 · AI · 通知 · 数据。
  // ⚠️ 名称固定两个字：长名会让五个药丸在 390px 上必须横滑、且首组被裁。
  { key: 'appearance', label: '外观' },
  { key: 'pet', label: '桌宠' },
  { key: 'ai', label: 'AI' },
  { key: 'alerts', label: '通知' },
  { key: 'data', label: '数据' },
]

/* 分类管理不在这里：情报分类与藏阁分类都在各自页面的页签行尾「+」就地增删
   （分类是业务表 categories，随快照跨设备同步，不再是设置项）。 */

export function SettingsPage() {
  const [group, setGroup] = useState<SettingsGroup>('appearance')
  /** 外部意图（如桌宠菜单的「桌宠设置」）→ 切到指定分组（见 settings-intent.ts） */
  useEffect(() => onSettingsGroupRequest(setGroup), [])

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
      {group === 'alerts' && <AlertsGroup />}
      {group === 'pet' && <PetSettingsGroup />}
      {group === 'ai' && <AiGroup />}
      {group === 'data' && (
        <>
          {/* 顺序即优先级（Step 5-3C）：同步是这一组的主题（"我的数据在不在"），
              情报 / 备份 / 修复都是它的下游 —— 先摆最常被问的那件事 */}
          <SyncGroup />
          {/* 抓取与代理（2026-10-01 从 AI 组移入）：代理同时服务同步与情报抓取，
              与「同步」「情报数据管理」同组后，AI 页才能只剩三段（模型与连接 / 人设 / 记忆） */}
          <Collapse title="抓取与代理" className="!pb-0">
            <ProxyConfig />
            <SourceManager />
          </Collapse>
          <DataGroup />
        </>
      )}

      <p className="py-6 text-center eyebrow text-ink-faint">
        知白台 v{APP_VERSION} · Local-first
      </p>
    </div>
  )
}
