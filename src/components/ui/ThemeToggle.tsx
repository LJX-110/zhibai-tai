/**
 * ThemeToggle —— 浅色 / 深色 / 跟随系统 循环切换
 */
import { Monitor, Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import type { ThemeMode } from '../../stores/useSettingsStore'
import { cn } from '../../utils/cn'
import { Tooltip } from './Tooltip'

const ORDER: ThemeMode[] = ['light', 'dark', 'system']
const LABEL: Record<ThemeMode, string> = { light: '浅色', dark: '深色', system: '跟随系统' }
const ICON = { light: Sun, dark: Moon, system: Monitor }

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSettingsStore((s) => s.theme)
  const set = useSettingsStore((s) => s.set)
  const Icon = ICON[theme]
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]

  return (
    <Tooltip label={`主题：${LABEL[theme]}（点击切到${LABEL[next]}）`}>
      <button
        onClick={() => set({ theme: next })}
        aria-label="切换主题"
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-muted transition-colors hover:bg-raised hover:text-ink',
          className,
        )}
      >
        <Icon size={15} />
      </button>
    </Tooltip>
  )
}
