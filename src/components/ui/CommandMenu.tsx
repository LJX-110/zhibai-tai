/**
 * CommandMenu —— 命令面板（/ 或 Ctrl+K）
 * 命令：快速新建 / 跳转；搜索：全局分组检索 + 键盘导航
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：命令清单、全局搜索、行形制各自成文件
 * 放在 `./command-menu/` 下（**不对外导出**，`ui/index.ts` 的唯一出口约定保持不变）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { SectionId } from '../../app/navigation'
import { useAppStore } from '../../stores/useAppStore'
import { useInspectorStore } from '../inspector/Inspector'
import { hasActiveOverlay } from './overlay'
import { cn } from '../../utils/cn'
import { useToast } from './Toast'
import { buildCommands, groupBy, groupIcon, NEW_ICON, type Command } from './command-menu/commands'
import { searchAll, type SearchResult } from './command-menu/search'
import { CommandRow } from './command-menu/CommandRow'

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'cmd' | 'search'>('cmd')
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const setSection = useAppStore((s) => s.setSection)
  const toast = useToast().toast
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQuery('')
        setCursor(0)
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = e.target as HTMLElement
        const tag = el?.tagName
        // 输入框内不拦截
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el?.isContentEditable) {
          e.preventDefault()
          setOpen(true)
          setTab('search')
          setQuery('')
          setCursor(0)
        }
      }
      // 堆叠时让位：有模态弹层在上（如帮助弹窗），Esc 只关最上层，
      // 否则一次 Esc 会把命令面板一起关掉
      if (e.key === 'Escape' && !hasActiveOverlay()) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = useCallback((s: SectionId) => {
    setSection(s)
    setOpen(false)
  }, [setSection])

  /** 快速命令 */
  const commands = useMemo<Command[]>(
    () => buildCommands({ go, toast, close: () => setOpen(false) }),
    [go, toast],
  )

  /** 全局搜索 */
  const results = useMemo<SearchResult[]>(() => searchAll(query), [query])

  /** 搜索结果处理：有详情面板的直达条目，否则跳板块 */
  const openResult = useCallback((r: SearchResult) => {
    go(r.section)
    if (r.inspector && r.entityId) {
      useInspectorStore.getState().open(r.inspector, r.entityId)
    }
  }, [go])

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>()
    for (const r of results) {
      const arr = map.get(r.group) ?? []
      arr.push(r)
      map.set(r.group, arr)
    }
    return [...map.entries()]
  }, [results])

  // 光标重置已在改动 query/tab 的事件处同步完成，不再需要 effect 二次渲染

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const onEnter = () => {
    if (tab === 'search') {
      const flat = results
      if (flat[cursor]) openResult(flat[cursor])
    } else {
      const flat = commands
      if (flat[cursor]) {
        flat[cursor].run()
      }
    }
  }

  if (!open) return null

  const renderFlat = tab === 'search' ? results : commands

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-command)] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        className="relative w-full max-w-lg rounded-sheet bg-paper shadow-overlay anim-enter-fast"
      >
        {/* 输入 + 模式切换 */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {tab === 'search' ? (
            <Search size={16} className="text-ink-faint" />
          ) : (
            <Sparkles size={16} className="text-bronze" />
          )}
          <input
            autoFocus
            aria-label={tab === 'search' ? '全局搜索' : '命令搜索'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(renderFlat.length - 1, c + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                onEnter()
              }
            }}
            placeholder={tab === 'search' ? '搜索：任务 / 笔记 / 收藏 / 项目 / 情报 / 课程 / 消费' : '执行命令…'}
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="flex gap-1 rounded-control bg-nested/50 p-0.5">
            {([
              { key: 'cmd', label: '命令' },
              { key: 'search', label: '搜索' },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key)
                  setQuery('')
                  setCursor(0)
                }}
                className={cn(
                  'rounded-control px-2 py-0.5 text-xs transition-colors',
                  tab === t.key ? 'bg-paper text-ink' : 'text-ink-muted',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {tab === 'cmd' ? (
            <div className="space-y-2">
              {groupBy(commands).map(([group, items]) => (
                <div key={group}>
                  <div className="px-3 py-1 text-xs tracking-widest text-ink-faint">{group}</div>
                  {items.map((c) => (
                    <CommandRow key={c.id} active={cursor === commands.indexOf(c)} icon={group === '新建' ? NEW_ICON : undefined} label={c.label} hint={c.hint} onClick={c.run} />
                  ))}
                </div>
              ))}
            </div>
          ) : query ? (
            grouped.length > 0 ? (
              <div className="space-y-2">
                {grouped.map(([group, items]) => (
                  <div key={group}>
                    <div className="px-3 py-1 text-xs tracking-widest text-ink-faint">{group}</div>
                    {items.map((r) => (
                      <CommandRow key={r.id} active={cursor === results.indexOf(r)} icon={groupIcon(r.group)} label={r.title} hint={r.sub} onClick={() => openResult(r)} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-ink-faint">未找到「{query}」</p>
            )
          ) : (
            <div className="px-3 py-8 text-center text-sm text-ink-faint">
              输入关键词开始搜索（任务 / 笔记 / 收藏 / 项目 / 情报 / 课程 / 消费）
            </div>
          )}
        </div>

        {/* 字号例外：四条快捷键图例必须锁在一行内（命令面板不做换行），
            放大到 text-xs 后 375px 上会折行把面板撑高，故保持 10px。 */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[10px] text-ink-faint">
          <span>↑↓ 选择</span>
          <span>Enter 执行</span>
          <span>Esc 关闭</span>
          <span className="ml-auto">/ 或 Ctrl+K 呼出</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
