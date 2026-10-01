/**
 * 设置 · 外观与目标（个人 / 安装 / 主题 / 布局 / 目标 / 更多设置）
 *
 * 从 SettingsPage 拆出；通知、桌宠、故障记录各自成子组件（`NotifyGroup` / `PetGroup` /
 * `ErrorLogPanel`）—— 本文件只负责"外观与目标"本身，避免又长成什么都装的口袋。
 */
import { useState, useSyncExternalStore } from 'react'
import { Monitor, MonitorDown, Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { ThemeMode } from '../../stores/useSettingsStore'
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import type { LayoutMode } from '../../stores/useAppStore'
import {
  hasInstallPrompt,
  isIOS,
  isStandalone,
  noInstallPrompt,
  promptInstall,
  subscribeInstall,
} from '../../components/pwa/install'
import { Button, Input, Section } from '../../components/ui'
import { cn } from '../../utils/cn'

const LAYOUT_OPTIONS: { value: LayoutMode; label: string; desc: string }[] = [
  { value: 'desktop', label: '桌面工作台', desc: '左侧导航 · 宽内容区 · 多列信息' },
  { value: 'mobile', label: '移动终端', desc: '顶部状态 · 单列内容 · 底部导航' },
  { value: 'auto', label: '自动', desc: '按屏幕宽度自适应' },
]

// 描述写的是**主题实际的主辅色**（改配色时这里必须同步，否则是误导）
const THEME_OPTIONS: { value: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', desc: '纯白 · 墨 · 黛蓝', icon: Sun },
  { value: 'dark', label: '深色', desc: '玄黑 · 绛红 · 黛蓝', icon: Moon },
  { value: 'system', label: '跟随系统', desc: '随设备自动切换', icon: Monitor },
]

export function AppearanceGroup() {
  const settings = useSettingsStore()
  const resolved = useResolvedLayout()
  // PWA 安装能力 —— 与底部提示条共用 install.ts，免得两处判定分叉
  const canInstall = useSyncExternalStore(subscribeInstall, hasInstallPrompt, noInstallPrompt)
  const [ios] = useState(isIOS)
  const [installed, setInstalled] = useState(isStandalone)
  const installNow = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') setInstalled(true)
  }
  return (
    <>
      <Section title="个人">
        <div className="row">
          <span className="w-20 shrink-0 text-sm text-ink-muted">称呼</span>
          <Input
            value={settings.profileName}
            onChange={(e) => settings.set({ profileName: e.target.value })}
            className="max-w-[220px]"
            placeholder="怎么称呼你"
          />
        </div>
      </Section>

      {/* 安装到桌面 / 主屏幕：常驻入口。
          浏览器的安装提示只在特定时机抛一次，关掉底部提示条后就再没有入口可找；
          这里给一个随时能查、随时能装的地方。iOS 由于无法程序化安装，只给分步指引。 */}
      <Section title="安装">
        {installed ? (
          <p className="text-xs leading-relaxed text-ink-muted">
            已安装为应用，正以独立窗口运行。
          </p>
        ) : (
          <div className="space-y-2">
            {canInstall ? (
              <Button size="sm" variant="primary" onClick={() => void installNow()}>
                <MonitorDown size={14} /> 立即安装
              </Button>
            ) : null}
            <p className="text-xs leading-relaxed text-ink-muted">
              {ios
                ? 'iPhone / iPad：点 Safari 底部中间的「分享」，选「添加到主屏幕」。'
                : canInstall
                  ? '装到桌面后可离线使用，打开更快。'
                  : '在浏览器地址栏右侧找「安装」图标（Chrome / Edge），或菜单里的「安装应用」。'}
            </p>
          </div>
        )}
      </Section>

      <Section title="主题">
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => settings.set({ theme: o.value })}
              className={cn(
                'rounded-paper border p-4 text-center transition-colors',
                settings.theme === o.value
                  ? 'border-cinnabar/50 bg-cinnabar/5'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <o.icon size={18} className="mx-auto mb-1.5 text-ink-soft" />
              <div className="text-sm font-medium text-ink">{o.label}</div>
              <div className="mt-0.5 text-xs text-ink-faint">{o.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="布局模式" hint={`当前：${resolved === 'desktop' ? '桌面工作台' : '移动终端'}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LAYOUT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => settings.set({ layoutMode: o.value })}
              className={cn(
                'rounded-paper border p-4 text-left transition-colors',
                settings.layoutMode === o.value
                  ? 'border-cinnabar/50 bg-cinnabar/5'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <div className="display text-sm font-semibold text-ink">{o.label}</div>
              <div className="mt-1 text-xs leading-relaxed text-ink-muted">{o.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="目标">
        <div className="row">
          <span className="w-28 shrink-0 text-sm text-ink-muted">每日饮水目标</span>
          <Input
            type="number"
            min={0}
            step={100}
            value={settings.waterGoalMl}
            onChange={(e) => settings.set({ waterGoalMl: Number(e.target.value) || 0 })}
            className="max-w-[160px]"
          />
          <span className="text-xs text-ink-faint">ml</span>
        </div>
      </Section>

      {/* 番茄钟：与「目标」同类（都是"我怎么用它"的参数），不再压进折叠里 ——
          折叠去掉后这一组只剩 6 段，首屏也不会长到需要收。 */}
      <Section title="番茄钟">
        <div className="row">
          <span className="w-28 shrink-0 text-sm text-ink-muted">番茄钟 · 专注</span>
          <Input
            type="number"
            min={1}
            value={settings.pomodoroFocusMin}
            onChange={(e) => settings.set({ pomodoroFocusMin: Number(e.target.value) || 25 })}
            className="max-w-[160px]"
          />
          <span className="text-xs text-ink-faint">分钟</span>
        </div>
        <div className="row">
          <span className="w-28 shrink-0 text-sm text-ink-muted">番茄钟 · 休整</span>
          <Input
            type="number"
            min={1}
            value={settings.pomodoroBreakMin}
            onChange={(e) => settings.set({ pomodoroBreakMin: Number(e.target.value) || 5 })}
            className="max-w-[160px]"
          />
          <span className="text-xs text-ink-faint">分钟</span>
        </div>
      </Section>

      {/* hint 原先写「Web Audio 合成 · 默认关闭」：环境音那行正文里已把这两点都说全
          （Web Audio 实时合成 / 默认关闭），标题行再挂一遍纯属重复 */}
    </>
  )
}
