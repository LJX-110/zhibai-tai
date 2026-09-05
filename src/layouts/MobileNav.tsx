/**
 * MobileWorkspace 导航 —— 顶部状态 + 底部导航（观 行 修 学 + 更多）
 * 触控目标 ≥44px；底部标签带编号
 * 视觉：顶栏/底栏/更多抽屉与桌面侧栏同一语言（var(--sidebar)，
 * 浅色黛蓝 / 深色绛红），内容区保持宣纸白，主次分明
 */
import { useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import {
  NAV_SECTIONS,
  SYSTEM_SECTION,
  navSectionOf,
  type NavSection,
  type SectionId,
} from '../app/navigation'
import { todayISO } from '../utils/id'
import { Sheet, ThemeToggle } from '../components/ui'
import { cn } from '../utils/cn'

/** 底部高频导航（前 4 + 更多） */
const MOBILE_TABS: NavSection[] = NAV_SECTIONS.slice(0, 4)
const MORE_SECTIONS: NavSection[] = [...NAV_SECTIONS.slice(4), SYSTEM_SECTION]

export function MobileHeader() {
  const section = useAppStore((s) => s.section)
  const current = navSectionOf(section)
  const today = todayISO()
  const [, , day] = today.split('-')

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-sidebar/97 px-4 pb-2 pt-3 backdrop-blur-sm">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[11px] tracking-[0.2em] text-on-sidebar-muted">{current.index}</span>
        <div>
          <div className="display text-lg font-semibold tracking-wide text-on-sidebar">{current.label}</div>
          <div className="text-[10px] tracking-[0.2em] text-on-sidebar-muted">{current.sub}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 text-on-sidebar-muted">
        <ThemeToggle className="h-9 w-9 border border-white/15 text-on-sidebar-muted hover:bg-white/10 hover:text-on-sidebar" />
        <span className="tabular text-sm">{day} 日</span>
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
  const [moreOpen, setMoreOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const go = (id: SectionId) => {
    setSection(id)
    setMoreOpen(false)
  }

  return (
    <>
      <nav
        ref={navRef}
        className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-sidebar/97 backdrop-blur-sm pb-safe"
        style={{ height: 'var(--mobile-nav-h)' }}
      >
        <div className="mx-auto flex h-full max-w-lg items-stretch">
          {MOBILE_TABS.map((s) => {
            const active = section === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                  active ? 'text-on-sidebar' : 'text-on-sidebar-muted',
                )}
              >
                <span className={cn('text-base leading-none', active && 'display')}>
                  {s.label}
                </span>
                <span className={cn('text-[9px] tracking-[0.16em]', active ? 'text-on-sidebar' : 'text-on-sidebar-muted opacity-70')}>
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
            aria-current={MORE_SECTIONS.some((m) => m.id === section) ? 'page' : undefined}
            className={cn(
              'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]',
              moreOpen || MORE_SECTIONS.some((m) => m.id === section)
                ? 'text-on-sidebar'
                : 'text-on-sidebar-muted',
            )}
          >
            <span className="text-base leading-none">⋯</span>
            <span className="text-[9px] tracking-[0.16em] opacity-70">MORE</span>
          </button>
        </div>
      </nav>

      {/* 更多抽屉（与侧栏同色系） */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="更多空间" tone="sidebar">
        <div className="grid grid-cols-1 gap-1.5">
          {MORE_SECTIONS.map((s) => {
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
                <span className="text-xs text-on-sidebar-muted">{s.desc}</span>
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}
