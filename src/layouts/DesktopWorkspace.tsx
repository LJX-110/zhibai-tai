/**
 * DesktopWorkspace —— 桌面工作台
 * 左侧导航 + 顶栏 + 宽内容区
 */
import { Command, Focus } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { usePomodoroTimerStore } from '../stores/usePomodoroTimerStore'
import { navSectionOf } from '../app/navigation'
import { PageRouter } from '../app/PageRouter'
import { DesktopSidebar } from './DesktopSidebar'
import { FocusMode } from '../components/focus/FocusMode'
import { CommandMenu, ThemeToggle, ToastViewport } from '../components/ui'
import { Inspector, useInspectorStore } from '../components/inspector/Inspector'
import { playSound } from '../services/sound'
import { todayISO, weekdayCN } from '../utils/id'
import { cn } from '../utils/cn'

export function DesktopWorkspace() {
  const section = useAppStore((s) => s.section)
  const setFocusMode = useAppStore((s) => s.setFocusMode)
  const syncStatus = useSettingsStore((s) => s.syncStatus)
  const inspectorOpen = useInspectorStore((s) => s.type != null)
  const current = navSectionOf(section)
  // 全局番茄钟芯片（任意页面可见可控）
  const pomoRunning = usePomodoroTimerStore((s) => s.running)
  const pomoSeconds = usePomodoroTimerStore((s) => s.seconds)
  const pomoMode = usePomodoroTimerStore((s) => s.mode)
  const pomoPause = usePomodoroTimerStore((s) => s.pause)
  const now = new Date()
  const date = todayISO()
  const pmm = String(Math.floor(pomoSeconds / 60)).padStart(2, '0')
  const pss = String(pomoSeconds % 60).padStart(2, '0')

  return (
    <div className="min-h-screen">
      <DesktopSidebar />

      <div className="pl-[var(--nav-w)]">
        {/* 顶栏 */}
        <header className="sticky top-0 z-30 border-b border-line bg-paper/92 backdrop-blur-sm">
          <div className="h-[3px] w-full bg-gradient-to-r from-bronze/70 via-bronze/40 to-transparent" />
          <div className="flex h-[calc(var(--header-h)-3px)] items-center justify-between px-8">
            <div className="flex items-baseline gap-3">
              <span className="mono-meta text-teal">{current.index}</span>
              <h2 className="scribal-title text-2xl text-ink">{current.label}</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <ThemeToggle />
              <span className="mono-meta hidden sm:inline">
                {date} · 周{weekdayCN(now.getDay())} · {String(now.getHours()).padStart(2, '0')}:
                {String(now.getMinutes()).padStart(2, '0')}
              </span>
            {/* 全局番茄钟芯片 */}
            {pomoRunning && (
              <button
                onClick={() => {
                  pomoPause()
                  playSound('ui-close')
                }}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-teal/40 bg-teal/10 px-2.5 py-1.5 text-ink-muted transition-colors hover:border-teal/70 hover:text-teal"
                title="全局番茄钟 · 点击暂停"
              >
                <span className="text-[11px]">{pomoMode === 'focus' ? '专注' : '休整'}</span>
                <span className="mono-meta text-xs text-teal">
                  {pmm}:{pss}
                </span>
              </button>
            )}
            {syncStatus === 'error' && (
              <span className="text-cinnabar">同步异常</span>
            )}
            <button
              onClick={() => {
                setFocusMode(true)
                playSound('ui-open')
              }}
              className="hidden items-center gap-1.5 rounded-[6px] border border-cinnabar/30 px-2.5 py-1.5 text-ink-muted transition-colors hover:border-cinnabar/60 hover:text-cinnabar md:inline-flex"
              title="进入专注模式"
            >
              <Focus size={13} /> 专注
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
              }}
              className="hidden items-center gap-1.5 rounded-[6px] border border-line px-2.5 py-1.5 text-ink-faint transition-colors hover:border-line-strong hover:text-ink md:inline-flex"
            >
              <Command size={13} /> 命令
              <kbd className="rounded-control bg-nested px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
            </button>
          </div>
          </div>
        </header>

        <main
          className={cn(
            'mx-auto max-w-[var(--content-max-w)] px-8 py-8 transition-[padding] duration-med lg:px-10',
            inspectorOpen && 'pr-[380px]',
          )}
        >
          <div key={section} className="ink-reveal">
            <PageRouter section={section} />
          </div>
        </main>
      </div>

      <FocusMode />
      <Inspector />
      <CommandMenu />
      <ToastViewport />
    </div>
  )
}
