/**
 * DesktopSidebar —— 桌面端左侧主导航（深黛青 · 编号双行导航）
 * 选中态：浅色底 + 左侧细朱砂线 + 小印记（避免厚重色块）
 */
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useAIChatStore } from '../components/ai/chat-store'
import { Bot } from 'lucide-react'
import { Taiji } from '../components/ui/Taiji'
import { NAV_SECTIONS, SYSTEM_SECTION, type SectionId } from '../app/navigation'
import { playSound } from '../services/sound'
import { cn } from '../utils/cn'

function NavButton({
  index,
  label,
  sub,
  active,
  onClick,
}: {
  id: SectionId
  index: string
  label: string
  sub: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-chip px-3 py-2 transition-colors duration-fast',
        active ? 'bg-paper/10 text-on-sidebar' : 'text-on-sidebar-muted hover:bg-paper/6 hover:text-on-sidebar',
      )}
    >
      {/* 选中：左侧朱砂印线 */}
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-cinnabar" />
      )}
      <span
        className={cn(
          'mono-meta w-6 shrink-0 text-right text-xs',
          active ? 'text-bronze' : 'text-on-sidebar-muted/60 group-hover:text-on-sidebar-muted',
        )}
      >
        {index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
        <span className={cn('text-sm font-medium', active && 'scribal-title text-base')}>{label}</span>
        <span
          className={cn(
            // 不再写 text-[9px]：.mono-meta 在 index.css 里未分层，本就会压过工具类，
            // 那个覆盖从未生效；字号统一由 .mono-meta（12px 令牌）决定
            'mono-meta',
            active ? 'text-bronze' : 'text-on-sidebar-muted/50',
          )}
        >
          {sub}
        </span>
      </span>
      {/* 选中：小印记 */}
      {active && (
        <span className="ml-auto h-1.5 w-1.5 shrink-0 rotate-45 bg-cinnabar" />
      )}
    </button>
  )
}

export function DesktopSidebar() {
  const section = useAppStore((s) => s.section)
  const setSection = useAppStore((s) => s.setSection)
  const lastSyncedAt = useSettingsStore((s) => s.lastSyncedAt)
  const syncStatus = useSettingsStore((s) => s.syncStatus)

  const go = (id: SectionId) => {
    if (id !== section) playSound('ui-click')
    setSection(id)
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex w-[var(--nav-w)] flex-col bg-sidebar text-on-sidebar">
      {/* 品牌 */}
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <Taiji size={40} />
          <div>
            <div className="scribal-title text-xl text-on-sidebar">知白台</div>
          </div>
        </div>
        {/* 符箓金线 */}
        <div className="mt-4 flex items-center gap-2">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-bronze/60 to-bronze/20" />
          <span className="scribal text-xs tracking-[0.3em] text-bronze/80">知白法台</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent via-bronze/60 to-bronze/20" />
        </div>
      </div>

      {/* 导航：编号 + 主名 + 副名 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {/* 字号交给 .mono-meta（12px 令牌），此处原先的 text-[9px] 被层外规则静默吃掉 */}
        <div className="mb-1 px-3 mono-meta text-on-sidebar-muted/50">
          空间 · SPACES
        </div>
        {NAV_SECTIONS.map((s) => (
          <NavButton
            key={s.id}
            id={s.id}
            index={s.index}
            label={s.label}
            sub={s.sub}
            active={section === s.id}
            onClick={() => go(s.id)}
          />
        ))}
      </nav>

      {/* 底部：帮 天机 + 系统 + 同步状态 */}
      <div className="border-t border-paper/10 px-3 py-3 space-y-1.5">
        <button
          type="button"
          onClick={() => useAIChatStore.getState().setOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-chip border border-teal/30 bg-teal/12 px-3 py-2 text-left transition-colors hover:border-teal/50 hover:bg-teal/18"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal text-on-sidebar">
            <Bot size={13} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-on-sidebar">天机</span>
            <span className="block text-xs text-on-sidebar-muted">AI 问答 · 一键简报</span>
          </span>
        </button>
        <NavButton
          id={SYSTEM_SECTION.id}
          index={SYSTEM_SECTION.index}
          label={SYSTEM_SECTION.label}
          sub={SYSTEM_SECTION.sub}
          active={section === SYSTEM_SECTION.id}
          onClick={() => go(SYSTEM_SECTION.id)}
        />
        {/* 同步状态：点击直达系统页（状态前置） */}
        <button
          type="button"
          onClick={() => go(SYSTEM_SECTION.id)}
          title={lastSyncedAt ? `上次同步 ${new Date(lastSyncedAt).toLocaleString('zh-CN')}` : '尚未同步 · 点击配置'}
          className="mt-2 flex w-full cursor-pointer items-center gap-1.5 rounded-control px-3 py-1 text-xs text-on-sidebar-muted transition-colors hover:bg-white/10 hover:text-on-sidebar"
        >
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              syncStatus === 'error'
                ? 'bg-cinnabar'
                : syncStatus === 'syncing'
                  ? 'bg-bronze-bright animate-pulse'
                  : lastSyncedAt
                    ? 'bg-bronze-bright'
                    : 'bg-on-sidebar-muted/50',
            )}
          />
          <span>
            {syncStatus === 'syncing'
              ? '同步中'
              : syncStatus === 'error'
                ? '同步失败 · 点击查看'
                : lastSyncedAt
                  ? `已同步 · ${lastSyncedAt.slice(5, 16).replace('T', ' ')}`
                  : '本地优先 · 未同步'}
          </span>
        </button>
      </div>
    </aside>
  )
}
