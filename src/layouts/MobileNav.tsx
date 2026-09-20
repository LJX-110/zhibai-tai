/**
 * MobileWorkspace 导航 —— 顶部状态 + 底部导航（固定 4 格 + 更多）
 * 触控目标 ≥44px；底部标签带编号
 * 视觉：顶栏/底栏/更多抽屉与桌面侧栏同一语言（var(--sidebar)，
 * 浅色黛蓝 / 深色绛红），内容区保持宣纸白，主次分明
 */
import { useMemo, useState } from 'react'
import { Bot, RefreshCw, Search } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import {
  ALL_SECTIONS,
  DEFAULT_MOBILE_TABS,
  NAV_SECTIONS,
  navSectionOf,
  type NavSection,
  type SectionId,
} from '../app/navigation'
import { weekdayCN } from '../utils/id'
import { playSound } from '../services/sound'
import { Sheet, useToast } from '../components/ui'
import { useAIChatStore } from '../components/ai/chat-store'
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
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const week = weekdayCN(now.getDay())
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
      toast('请先配置同步目标（仓库 + Token + 口令）', 'info')
      return
    }
    setSyncing(true)
    try {
      // 同步成功静默（顶栏圆点变绿即反馈），失败才弹
      await runSync()
    } catch (e) {
      toast(`同步失败：${e instanceof Error ? e.message : '未知错误'}`, 'danger')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <header className="sticky top-0 z-[var(--z-header)] flex items-center justify-between border-b border-white/10 bg-sidebar/97 px-4 pb-2 pt-3 backdrop-blur-sm">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-xs tracking-[0.2em] text-on-sidebar-muted">{current.index}</span>
        <div>
          <div className="display text-lg font-semibold tracking-wide text-on-sidebar">{current.label}</div>
          <div className="text-xs tracking-[0.2em] text-on-sidebar-muted">{current.sub}</div>
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
        <span className="tabular hidden whitespace-nowrap text-sm min-[360px]:inline">{month}月{day}日 · 周{week}</span>
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
  const setAIChatOpen = useAIChatStore((s) => s.setOpen)
  const [moreOpen, setMoreOpen] = useState(false)

  /** 底栏常驻板块：固定 4 格（观 · 行 · 财 · 学），第 5 格恒为「更多」。
   *  刻意不再做可配置：底栏是高频入口，配置越多越乱，其余板块统一收进抽屉。 */
  const tabs: NavSection[] = useMemo(() => {
    return DEFAULT_MOBILE_TABS.map((id) => NAV_SECTIONS.find((s) => s.id === id)).filter(
      (s): s is NavSection => Boolean(s),
    )
  }, [])

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
                  'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors',
                  active ? 'text-on-sidebar' : 'text-on-sidebar-muted',
                )}
              >
                <span className={cn('leading-none', active ? 'display text-base' : 'text-sm')}>
                  {s.label}
                </span>
                {/* 英文副标仅激活态显示：五个标签并排时都带双语会堆叠发挤。
                    字号例外：底栏 5 格在 375px 上每格仅约 75px，而副标是
                    字号例外：TODAY / FINANCE 这类大写英文 + 0.18em 字距，12px 会实测溢出
                    格宽（FINANCE ≈ 85px），故保持 8px，不收敛到令牌阶梯。 */}
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
            /* 非激活态只露出「⋯」，SVG/字符本身没有可访问名 —— 不给 aria-label
               时读屏会把这个按钮读成「省略号」，用户不知道它通向更多板块。
               英文副标 MORE 仅在激活态可见（见下方 hidden），也不能当名字用。 */
            aria-label="更多板块"
            className={cn(
              'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs',
              moreOpen || moreSections.some((m) => m.id === section)
                ? 'text-on-sidebar'
                : 'text-on-sidebar-muted',
            )}
          >
            <span className="text-base leading-none">⋯</span>
            {/* 字号例外（同上一格）：MORE 与副标同档，底栏格宽不足以承载 12px 大写英文 + 字距 */}
            <span className={cn('text-[8px] tracking-[0.18em]', moreOpen || moreSections.some((m) => m.id === section) ? 'text-on-sidebar/70' : 'hidden')}>
              MORE
            </span>
          </button>
        </div>
      </nav>

      {/* 更多抽屉（与侧栏同色系） */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="更多空间" tone="sidebar">
        <div className="space-y-2">
          {/* 天机：AI 总入口（抽屉常驻首位，不随板块配置变化） */}
          <button
            onClick={() => {
              setMoreOpen(false)
              setAIChatOpen(true)
            }}
            className="flex w-full items-center gap-3 rounded-paper border border-teal/40 bg-teal/10 px-3 py-2.5 text-left transition-colors hover:border-teal/60 hover:bg-teal/15"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-on-sidebar">
              <Bot size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="display block text-base font-semibold text-on-sidebar">天机</span>
              <span className="block text-xs tracking-[0.18em] text-on-sidebar-muted">
                AI 问答 · 一键简报
              </span>
            </span>
          </button>
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
                  <span className="tabular w-7 text-right text-xs text-on-sidebar-muted">{s.index}</span>
                  <span className="min-w-0 flex-1">
                    <span className="display block text-base font-semibold text-on-sidebar">
                      {s.label}
                    </span>
                    <span className="block text-xs tracking-[0.18em] text-on-sidebar-muted">{s.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </Sheet>
    </>
  )
}
