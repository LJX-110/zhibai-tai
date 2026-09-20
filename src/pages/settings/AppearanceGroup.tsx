/**
 * 设置 · 外观与目标（个人 / 安装 / 主题 / 布局 / 目标 / 更多设置）
 *
 * 从 SettingsPage 拆出，是四个分组中最大的一块。状态自洽：安装能力、通知诊断、
 * 通知历史都在本文件内。说明小字按「只留核心信息」精简过。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Monitor, MonitorDown, Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { ThemeMode } from '../../stores/useSettingsStore'
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import type { LayoutMode } from '../../stores/useAppStore'
import { playSound } from '../../services/sound'
import {
  browserNotify,
  clearNoticeHistory,
  getNotifyCapability,
  listNoticeHistory,
  requestNotifyPermission,
  sendTestNotification,
  type NoticeRecord,
  type NotifyCapability,
  type NotifyPermission,
} from '../../services/notification'
import {
  hasInstallPrompt,
  isIOS,
  isStandalone,
  noInstallPrompt,
  promptInstall,
  subscribeInstall,
} from '../../components/pwa/install'
import { Button, Collapse, Input, Section, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'
import { ErrorLogPanel } from './ErrorLogPanel'

/** 通知权限的中文说法（诊断区显示用） */
const PERM_LABEL: Record<NotifyPermission, string> = {
  unsupported: '不支持',
  default: '未授权',
  granted: '已授权',
  denied: '已拒绝',
}

const LAYOUT_OPTIONS: { value: LayoutMode; label: string; desc: string }[] = [
  { value: 'desktop', label: '桌面工作台', desc: '左侧导航 · 宽内容区 · 多列信息' },
  { value: 'mobile', label: '移动终端', desc: '顶部状态 · 单列内容 · 底部导航' },
  { value: 'auto', label: '自动', desc: '按屏幕宽度自适应' },
]

// 描述写的是**主题实际的主辅色**（改配色时这里必须同步，否则是误导）
const THEME_OPTIONS: { value: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', desc: '纸白 · 墨 · 黛蓝', icon: Sun },
  { value: 'dark', label: '深色', desc: '玄黑 · 绛红 · 黛蓝', icon: Moon },
  { value: 'system', label: '跟随系统', desc: '随设备自动切换', icon: Monitor },
]

export function AppearanceGroup() {
  const settings = useSettingsStore()
  const resolved = useResolvedLayout()
  const toast = useToast().toast
  // PWA 安装能力 —— 与底部提示条共用 install.ts，免得两处判定分叉
  const canInstall = useSyncExternalStore(subscribeInstall, hasInstallPrompt, noInstallPrompt)
  const [ios] = useState(isIOS)
  const [installed, setInstalled] = useState(isStandalone)
  const installNow = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') setInstalled(true)
  }
  // 通知诊断：开关变化后重测 —— 授权通常就发生在点开关的那一刻
  const [cap, setCap] = useState<NotifyCapability | null>(null)
  const [history, setHistory] = useState<NoticeRecord[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  useEffect(() => {
    void getNotifyCapability().then(setCap)
  }, [settings.browserNotify])
  const testNotify = async () => {
    setCap(await getNotifyCapability())
    const ok = await sendTestNotification()
    toast(
      ok
        ? '已发送测试通知'
        : '发送失败：看上方状态 —— 权限未授权、iOS 未安装为应用、SW 未就绪，三者任一都会发不出去',
      ok ? 'success' : 'danger',
    )
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

      {/* 低频项各归一处：手机首屏只留「改完立刻能感知」的项，其余一键展开 */}
      <Collapse title="更多设置" hint="番茄钟 · 音效 · 通知">
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

      {/* hint 原先写「Web Audio 合成 · 默认关闭」：环境音卡片正文里已把这两点都说全
          （Web Audio 实时合成 / 默认关闭），标题行再挂一遍纯属重复 */}
      <Section title="音效">
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">音效</span>
              <button
                role="switch"
                aria-checked={settings.soundEnabled}
                onClick={() => {
                  const next = !settings.soundEnabled
                  settings.set({ soundEnabled: next })
                  // 开启瞬间播一声确认：既是反馈也是"音效已可用"的自证
                  if (next) playSound('ui-confirm')
                }}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.soundEnabled ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.soundEnabled ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-ink-faint">
                <span>音量</span>
                <span className="tabular">{Math.round(settings.soundVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.soundVolume}
                onChange={(e) => settings.set({ soundVolume: Number(e.target.value) })}
                className="w-full accent-[var(--color-teal)]"
                aria-label="音效音量"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['seal', 'paper', 'compass', 'qimen'] as const).map((k) => (
                <Button key={k} size="sm" variant="tertiary" silent onClick={() => playSound(k)} className="!px-2">
                  {k}
                </Button>
              ))}
            </div>
          </div>
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">环境音</span>
              <button
                role="switch"
                aria-checked={settings.ambientEnabled}
                onClick={() => settings.set({ ambientEnabled: !settings.ambientEnabled })}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.ambientEnabled ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.ambientEnabled ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              极轻的低通噪声底（纸/风/静室感），Web Audio 实时合成；默认关闭。
            </p>
          </div>
        </div>
      </Section>

      <Section title="通知" hint="应用内提示">
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">应用内通知</span>
              <button
                role="switch"
                aria-checked={settings.notifyEnabled}
                onClick={() => settings.set({ notifyEnabled: !settings.notifyEnabled })}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.notifyEnabled ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.notifyEnabled ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">到期待办 · 上课 · 关注更新</p>
          </div>
          <div className="rounded-tile border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">浏览器通知</span>
              <button
                role="switch"
                aria-checked={settings.browserNotify}
                onClick={async () => {
                  const next = !settings.browserNotify
                  if (!next) {
                    settings.set({ browserNotify: false })
                    return
                  }
                  // 授权只能在用户手势里发起；拿不到授权就把开关回滚，
                  // 否则会留下一个「显示已开、实际永不提醒」的死开关
                  const perm = await requestNotifyPermission()
                  if (perm !== 'granted') {
                    settings.set({ browserNotify: false })
                    toast(
                      perm === 'unsupported'
                        ? '当前浏览器不支持系统通知'
                        : perm === 'denied'
                          ? '通知权限已被拒绝，请在浏览器站点设置里开启'
                          : '未获得通知授权',
                      'danger',
                    )
                    return
                  }
                  settings.set({ browserNotify: true })
                  void browserNotify('知白台', '通知已开启', '#/')
                }}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.browserNotify ? 'bg-teal' : 'bg-nested',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                    settings.browserNotify ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">需浏览器授权</p>

            {/* 通知诊断：把"卡在哪一步"直接摆出来。
                发不出去的原因分散在 权限 / 运行模式（iOS 必须装成 App）/ Service Worker
                三处，只给一个开关的话用户无从判断，只能以为"功能坏了"。 */}
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <p className="text-xs leading-relaxed text-ink-faint">
                权限 {PERM_LABEL[cap?.permission ?? 'unsupported']} · 运行{' '}
                {cap?.standalone ? '已安装为应用' : '浏览器标签页'} · Service Worker{' '}
                {cap?.swReady ? '已就绪' : '未就绪'}
              </p>
              <Button size="sm" variant="tertiary" onClick={() => void testNotify()}>
                发送测试通知
              </Button>
            </div>

            {/* 通知历史：toast 2.6 秒就消失，错过时能从这里回看 */}
            <div className="mt-2">
              <button
                onClick={() => {
                  // 展开时现读，避免显示的是上次打开时的旧记录
                  setHistory(listNoticeHistory())
                  setHistoryOpen((v) => !v)
                }}
                className="flex w-full items-center gap-2 py-1 text-xs text-ink-faint transition-colors hover:text-ink-muted"
                aria-expanded={historyOpen}
              >
                最近通知 · {history.length}
                <span className="ml-auto">{historyOpen ? '收起' : '展开'}</span>
              </button>
              {historyOpen && (
                <div className="mt-1 space-y-1">
                  {history.length === 0 ? (
                    <p className="py-1 text-xs text-ink-faint">还没有通知记录</p>
                  ) : (
                    <>
                      {history.map((n) => (
                        <p
                          key={n.id}
                          className="truncate text-xs text-ink-muted"
                          title={n.message}
                        >
                          {n.message}
                        </p>
                      ))}
                      <Button
                        size="sm"
                        variant="tertiary"
                        onClick={() => {
                          clearNoticeHistory()
                          setHistory([])
                        }}
                      >
                        清空记录
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 免打扰时段：该时段内提醒只记入历史，不弹提示、不发系统通知 */}
        <div className="mt-3 rounded-tile border border-line p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">免打扰时段</span>
            <button
              role="switch"
              aria-checked={settings.quietEnabled}
              onClick={() => settings.set({ quietEnabled: !settings.quietEnabled })}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                settings.quietEnabled ? 'bg-teal' : 'bg-nested',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all',
                  settings.quietEnabled ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </button>
          </div>
          {settings.quietEnabled && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="time"
                value={settings.quietFrom}
                onChange={(e) => settings.set({ quietFrom: e.target.value })}
                aria-label="免打扰开始时间"
              />
              <span className="text-ink-faint">至</span>
              <Input
                type="time"
                value={settings.quietTo}
                onChange={(e) => settings.set({ quietTo: e.target.value })}
                aria-label="免打扰结束时间"
              />
            </div>
          )}
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            {settings.quietEnabled
              ? `${settings.quietFrom} — ${settings.quietTo} 期间不打扰，提醒仍可在「最近通知」里回看。`
              : '开启后，该时段内不弹提示、不发系统通知，但提醒仍记入历史。'}
          </p>
        </div>
      </Section>

      {/* 故障记录：三类异常（渲染 / 脚本 / 未处理异步）的本机流水。
          放在这层折叠里是因为它属低频诊断项，不该挤占首屏。 */}
      <ErrorLogPanel />

      </Collapse>
    </>
  )
}
