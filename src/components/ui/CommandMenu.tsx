/**
 * CommandMenu —— 命令面板（/ 或 Ctrl+K）
 * 命令：快速新建 / 跳转；搜索：全局分组检索 + 键盘导航
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  CheckSquare,
  Coins,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
  Star,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { ALL_SECTIONS, type SectionId } from '../../app/navigation'
import { useAppStore } from '../../stores/useAppStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { useNoteStore } from '../../stores/useNoteStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { useCollectionStore } from '../../stores/useCollectionStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useCourseStore } from '../../stores/useStudyStore'
import { useFinanceStore } from '../../stores/useFinanceStore'
import { useSourceStore } from '../../stores/useSourceStore'
import { saveDailySignRecord } from '../../stores/useDivinationStore'
import { dedupeKey } from '../../components/source/SourceManager'
import { fetchAllFromSources } from '../../services/intelligence/providers/registry'
import { runSync } from '../../sync/SyncService'
import { createId, todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'
import { useToast } from './Toast'

interface Command {
  id: string
  label: string
  group: string
  hint?: string
  run: () => void
}

interface SearchResult {
  id: string
  group: string
  title: string
  sub?: string
  section: SectionId
}

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
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = useCallback((s: SectionId) => {
    setSection(s)
    setOpen(false)
  }, [setSection])

  /** 快速命令 */
  const commands = useMemo<Command[]>(() => {
    const now = new Date().toISOString()
    return [
      {
        id: 'task',
        label: '新建待办',
        group: '新建',
        hint: '→ 行 · 今日',
        run: () => go('action'),
      },
      {
        id: 'note',
        label: '新建笔记 / 灵感',
        group: '新建',
        hint: '→ 行 · 记事本',
        run: () => go('action'),
      },
      {
        id: 'water',
        label: '记录喝水 +300ml',
        group: '新建',
        hint: '立即记录',
        run: async () => {
          await useWaterStore.getState().add({
            id: createId(),
            date: todayISO(),
            amountMl: 300,
            createdAt: now,
          })
          toast('已记录 +300ml', 'success')
          setOpen(false)
        },
      },
      {
        id: 'expense',
        label: '记一笔支出',
        group: '新建',
        hint: '→ 财 · 本月',
        run: () => go('finance'),
      },
      {
        id: 'collection',
        label: '添加收藏',
        group: '新建',
        hint: '→ 藏 · 藏品',
        run: () => go('collection'),
      },
      {
        id: 'project',
        label: '新建项目',
        group: '新建',
        hint: '→ 藏 · 项目中心',
        run: () => go('collection'),
      },
      {
        id: 'pomo',
        label: '开始番茄钟',
        group: '新建',
        hint: '→ 学 · 番茄钟',
        run: () => go('study'),
      },
      {
        id: 'habit',
        label: '记录斩三尸',
        group: '新建',
        hint: '→ 修 · 斩三尸',
        run: () => go('cultivate'),
      },
      {
        id: 'focus',
        label: '进入专注模式',
        group: '新建',
        hint: '隐藏侧栏 · 只留任务与番茄钟',
        run: () => {
          useAppStore.getState().setFocusMode(true)
          setOpen(false)
        },
      },
      {
        id: 'open-liuyao',
        label: '六爻起卦',
        group: '新建',
        hint: '→ 奇 · 六爻',
        run: () => go('occult'),
      },
      {
        id: 'open-qimen',
        label: '奇门起盘',
        group: '新建',
        hint: '→ 奇 · 九宫',
        run: () => go('occult'),
      },
      {
        id: 'add-follow',
        label: '管理关注',
        group: '新建',
        hint: '→ 情 · 关注流',
        run: () => go('intelligence'),
      },
      {
        id: 'new-game',
        label: '新建游戏收藏',
        group: '新建',
        hint: '→ 藏 · 藏品',
        run: () => go('collection'),
      },
      {
        id: 'new-anime',
        label: '新建动漫收藏',
        group: '新建',
        hint: '→ 藏 · 藏品',
        run: () => go('collection'),
      },
      {
        id: 'fetch-intel',
        label: '抓取全部情报',
        group: '情报',
        hint: '从所有启用源拉取',
        run: async () => {
          const sources = useSourceStore.getState().items
          const fresh = await fetchAllFromSources(sources)
          // 与情报页同一去重口径（dedupeKey），且必须经 saveMany 落库：
          // 直接 setState 只改内存，刷新即丢、也不会触发自动同步
          const known = new Set(useIntelligenceStore.getState().items.map((x) => dedupeKey(x)))
          const added = fresh.filter((x) => !known.has(dedupeKey(x)))
          await useIntelligenceStore.getState().saveMany(added)
          toast(`已拉取 ${fresh.length} 条情报（新增 ${added.length}）`, 'success')
          setOpen(false)
        },
      },
      {
        id: 'sync-github',
        label: '同步 GitHub',
        group: '情报',
        hint: '拉取并推送私有仓库快照',
        run: async () => {
          setOpen(false)
          try {
            const res = await runSync()
            toast(`${res.message} · 拉取 ${res.pulled} 条`, 'success')
          } catch (e) {
            toast('同步失败：' + (e instanceof Error ? e.message : ''), 'danger')
          }
        },
      },
      {
        id: 'save-sign',
        label: '记录今日签',
        group: '情报',
        hint: '存档到奇·历史',
        run: async () => {
          // 与占卜页共用同一实现，避免两处逻辑漂移
          const { saved } = await saveDailySignRecord(todayISO())
          toast(saved ? '今日签已入档' : '今日签已记', saved ? 'success' : undefined)
          setOpen(false)
        },
      },
      ...ALL_SECTIONS.map((s) => ({
        id: `nav-${s.id}`,
        label: `${s.index} ${s.label} · ${s.desc}`,
        group: '跳转',
        run: () => go(s.id),
      })),
    ]
  }, [go, toast])

  /** 全局搜索 */
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const matches = (s: string) => s.toLowerCase().includes(q)
    const out: SearchResult[] = []
    const push = (g: string, section: SectionId, items: { id: string; title: string; sub?: string }[]) => {
      for (const it of items) {
        if (matches(it.title) || matches(it.sub ?? '')) {
          out.push({ id: `${g}-${it.id}`, group: g, title: it.title, sub: it.sub, section })
        }
      }
    }

    push('任务', 'action', useTaskStore.getState().items.map((t) => ({ id: t.id, title: t.title, sub: t.done ? '已完成' : '未完成' })))
    push('笔记', 'action', useNoteStore.getState().items.map((n) => ({ id: n.id, title: n.title || '（无题）', sub: n.kind === 'inspiration' ? '灵感' : '笔记' })))
    push('收藏', 'collection', useCollectionStore.getState().items.map((c) => ({ id: c.id, title: c.title, sub: c.category })))
    push('项目', 'collection', useProjectStore.getState().items.map((p) => ({ id: p.id, title: p.name, sub: p.status })))
    push('情报', 'intelligence', useIntelligenceStore.getState().items.map((i) => ({ id: i.id, title: i.title, sub: i.source })))
    push('课程', 'study', useCourseStore.getState().items.map((c) => ({ id: c.id, title: c.name, sub: c.teacher })))
    push('消费', 'finance', useFinanceStore.getState().items.map((f) => ({ id: f.id, title: f.merchant || f.note || '流水', sub: `${f.kind === 'income' ? '+' : '-'}${f.amount}` })))

    return out.slice(0, 30)
  }, [query])

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
      if (flat[cursor]) go(flat[cursor].section)
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
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        className="relative w-full max-w-lg rounded-sheet bg-paper shadow-overlay animate-[page-fade_120ms_ease]"
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
                  'rounded-control px-2 py-0.5 text-[11px] transition-colors',
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
                  <div className="px-3 py-1 text-[10px] tracking-widest text-ink-faint">{group}</div>
                  {items.map((c) => (
                    <CommandRow key={c.id} active={cursor === commands.indexOf(c)} icon={group === '新建' ? Plus : undefined} label={c.label} hint={c.hint} onClick={c.run} />
                  ))}
                </div>
              ))}
            </div>
          ) : query ? (
            grouped.length > 0 ? (
              <div className="space-y-2">
                {grouped.map(([group, items]) => (
                  <div key={group}>
                    <div className="px-3 py-1 text-[10px] tracking-widest text-ink-faint">{group}</div>
                    {items.map((r) => (
                      <CommandRow key={r.id} active={cursor === results.indexOf(r)} icon={groupIcon(r.group)} label={r.title} hint={r.sub} onClick={() => go(r.section)} />
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

function groupBy(arr: Command[]): [string, Command[]][] {
  const map = new Map<string, Command[]>()
  for (const c of arr) {
    const list = map.get(c.group) ?? []
    list.push(c)
    map.set(c.group, list)
  }
  return [...map.entries()]
}

function groupIcon(group: string) {
  const map: Record<string, typeof Search> = {
    任务: CheckSquare,
    笔记: Archive,
    收藏: Star,
    项目: Star,
    情报: Sparkles,
    课程: GraduationCap,
    消费: Coins,
  }
  return map[group]
}

function CommandRow({
  active,
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  active: boolean
  icon?: typeof Plus
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-tile px-3 py-2 text-left transition-colors',
        active ? 'bg-raised' : '',
      )}
    >
      {Icon && <Icon size={14} className="shrink-0 text-ink-muted" />}
      <span className="truncate text-sm text-ink">{label}</span>
      {hint && <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{hint}</span>}
    </button>
  )
}
