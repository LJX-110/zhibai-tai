/**
 * MobileWorkspace 导航 —— 顶部状态 + 底部导航（可配置 4 格 + 更多）
 * 触控目标 ≥44px；底部标签带编号
 * 视觉：顶栏/底栏/更多抽屉与桌面侧栏同一语言（var(--sidebar)，
 * 浅色黛蓝 / 深色绛红），内容区保持宣纸白，主次分明
 */
import { useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import {
  ALL_SECTIONS,
  NAV_SECTIONS,
  normalizeMobileTabs,
  navSectionOf,
  type NavSection,
  type SectionId,
} from '../app/navigation'
import { todayISO } from '../utils/id'
import { playSound } from '../services/sound'
import { Sheet, ThemeToggle, useToast } from '../components/ui'
import { runSync } from '../sync/SyncService'
import { isConfigured, isSyncConfigured } from '../sync/auto'
import { cn } from '../utils/cn'

/** 同步状态点：绿=成功 红=失败 金=进行中 灰=未配置 */
function syncDotClass(status: string, configured: boolean): string {
  if (!configured) return 'bg-on-sidebar-muted/60'
  if (status === 'syncing') return 'bg-gold-btn'
  if (status === 'error') return 'bg-cinnabar'
  if (status === 'success') return 'bg-teal'
  return 'bg-on-sidebar-muted'
}

export function MobileHeader() {
  const section = useAppStore((s) => s.section)
  const setSection = useAppStore((s) => s.setSection)
  const current = navSectionOf(section)
  const today = todayISO()
  const [, , day] = today.split('-')
  const syncStatus = useSettingsStore((s) => s.syncStatus)
  // 派生布尔在 selector 内计算（只返回原始值，不生成新引用）
  const syncConfigured = useSettingsStore((s) => isConfigured(s))
  const toast = useToast().toast
  const [syncing, setSyncing] = useState(false)

  /** 顶栏同步入口：未配置直接带去设置，已配置则就地同步并回报结果 */
  const onSync = async () => {
    if (syncing) return
    if (!isSyncConfigured()) {
      setSection('system')
      toast('请先在「同步」中配置仓库与密码', 'info')
      return
    }
    setSyncing(true)
    try {
      const res = await runSync()
      toast(res.message ?? '同步完成', 'success')
    } catch (e) {
      toast(`同步失败：${e instanceof Error ? e.message : '未知错误'}`, 'danger')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <header className="sticky top-0 z-[var(--z-header)] flex items-center justify-between border-b border-white/10 bg-sidebar/97 px-4 pb-2 pt-3 backdrop-blur-sm">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[11px] tracking-[0.2em] text-on-sidebar-muted">{current.index}</span>
        <div>
          <div className="display text-lg font-semibold tracking-wide text-on-sidebar">{current.label}</div>
          <div className="text-[10px] tracking-[0.2em] text-on-sidebar-muted">{current.sub}</div>
        </div>
      </div>
      <div className="flex items-center gap-0.5 text-on-sidebar-muted">
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-tile hover:bg-white/10 hover:text-on-sidebar"
          aria-label={syncing ? '同步中' : '立即同步'}
          title={syncConfigured ? '立即同步' : '未配置同步'}
          onClick={() => void onSync()}
        >
          <RefreshCw size={16} className={cn(syncing && 'animate-spin')} />
          <span
            className={cn(
              'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full',
              syncDotClass(syncStatus, syncConfigured),
            )}
          />
        </button>
        <ThemeToggle className="h-9 w-9 border border-white/15 text-on-sidebar-muted hover:bg-white/10 hover:text-on-sidebar" />
        <span className="tabular hidden text-sm min-[360px]:inline">{day} 日</span>
        <button
          className="touch-target flex items-center justify-center rounded-tile hover:bg-white/10 hover:text-on-sidebar"
          aria-label="搜索"
          onClick={() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))
          }
        >
          <Search size={17} />
        </button>
      </div>
    </header>
  )
}

export function MobileNav() {
  const section = useAppStore((s) => s.section)
  const setSection = useAppStore((s) => s.setSection)
  const mobileTabs = useSettingsStore((s) => s.mobileTabs)
  const [moreOpen, setMoreOpen] = useState(false)

  /** 底栏常驻板块：以设置为准（规范化后一定满 4 格） */
  const tabs: NavSection[] = useMemo(() => {
    return normalizeMobileTabs(mobileTabs)
      .map((id) => NAV_SECTIONS.find((s) => s.id === id))
      .filter((s): s is NavSection => Boolean(s))
  }, [mobileTabs])

  /** 「更多」抽屉：全部板块里未上底栏的那些（含系统） */
  const moreSections = useMemo(() => {
    const pinned = new Set(tabs.map((s) => s.id))
    return ALL_SECTIONS.filter((s) => !pinned.has(s.id))
  }, [tabs])

  const go = (id: SectionId) => {
    if (id !== section) playSound('ui-click')
    setSection(id)
    setMoreOpen(false)
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-white/10 bg-sidebar/97 backdrop-blur-sm pb-safe"
        style={{ height: 'var(--mobile-nav-h)' }}
      >
        <div className="mx-auto flex h-full max-w-lg items-stretch">
          {tabs.map((s) => {
            const active = section === s.id
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (!active) playSound('ui-click')
                  setSection(s.id)
                }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                  active ? 'text-on-sidebar' : 'text-on-sidebar-muted',
                )}
              >
                <span className={cn('leading-none', active ? 'display text-base' : 'text-sm')}>
                  {s.label}
                </span>
                {/* 英文副标仅激活态显示：五个标签并排时都带双语会堆叠发挤 */}
                <span
                  className={cn(
                    'text-[8px] tracking-[0.18em]',
                    active ? 'text-on-sidebar/70' : 'hidden',
                  )}
                >
                  {s.sub}
                </span>
                {active && (
                  <span className="absolute top-1 h-1 w-1 rounded-full bg-gold-btn" />
                )}
              </button>
            )
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-current={moreSections.some((m) => m.id === section) ? 'page' : undefined}
            className={cn(
              'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]',
              moreOpen || moreSections.some((m) => m.id === section)
                ? 'text-on-sidebar'
                : 'text-on-sidebar-muted',
            )}
          >
            <span className="text-base leading-none">⋯</span>
            <span className={cn('text-[8px] tracking-[0.18em]', moreOpen || moreSections.some((m) => m.id === section) ? 'text-on-sidebar/70' : 'hidden')}>
              MORE
            </span>
          </button>
        </div>
      </nav>

      {/* 更多抽屉（与侧栏同色系） */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="更多空间" tone="sidebar">
        <div className="grid grid-cols-1 gap-1.5">
          {moreSections.map((s) => {
            const active = section === s.id
            return (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                className={cn(
                  'flex min-h-[52px] items-center gap-3 rounded-paper border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-gold-btn/50 bg-white/10'
                    : 'border-white/10 hover:border-white/25 hover:bg-white/5',
                )}
              >
                <span className="tabular w-7 text-right text-[11px] text-on-sidebar-muted">{s.index}</span>
                <span className="min-w-0 flex-1">
                  <span className="display block text-base font-semibold text-on-sidebar">
                    {s.label}
                  </span>
                  <span className="block text-[10px] tracking-[0.18em] text-on-sidebar-muted">{s.sub}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}
