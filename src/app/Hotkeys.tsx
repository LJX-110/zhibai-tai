/**
 * Hotkeys —— 全局键盘体系
 *  · 数字 1-9 跳转九个空间，0 跳转系统
 *  · ?（Shift+/）呼出速查表
 *  · / 与 Ctrl+K 由 CommandMenu 自行处理
 * 输入框/文本域聚焦时不拦截任何按键。
 */
import { useEffect, useState } from 'react'
import { Dialog } from '../components/ui/Dialog'
import { NAV_SECTIONS, SYSTEM_SECTION } from './navigation'
import { useAppStore } from '../stores/useAppStore'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

const NAV_KEYS = '123456789'

export function Hotkeys() {
  const setSection = useAppStore((s) => s.setSection)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return

      if (e.key === '?' || e.key === '？') {
        e.preventDefault()
        setHelpOpen((v) => !v)
        return
      }
      const idx = NAV_KEYS.indexOf(e.key)
      if (idx >= 0 && NAV_SECTIONS[idx]) {
        setSection(NAV_SECTIONS[idx].id)
        return
      }
      if (e.key === '0') setSection(SYSTEM_SECTION.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSection])

  return (
    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="键盘速查" className="max-w-sm">
      <div className="space-y-2 text-sm">
        <KbdRow keys={['1', '…', '9']} desc="跳转对应空间（观 行 修 学 财 藏 情 奇 术）" />
        <KbdRow keys={['0']} desc="跳转系统" />
        <KbdRow keys={['/']} desc="全局搜索 / 命令面板" />
        <KbdRow keys={['?']} desc="打开此速查表" />
        <KbdRow keys={['Esc']} desc="关闭弹层 / 面板" />
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">输入框聚焦时快捷键自动失效。</p>
    </Dialog>
  )
}

function KbdRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex shrink-0 gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="min-w-6 rounded-[4px] border border-line bg-nested px-1.5 py-0.5 text-center font-mono text-xs text-ink"
          >
            {k}
          </kbd>
        ))}
      </span>
      <span className="text-ink-muted">{desc}</span>
    </div>
  )
}
