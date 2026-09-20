/**
 * 行 · 记事本页签（含笔记详情抽屉与「笔记 → 待办」闭环）
 */
import { useState } from 'react'
import { ListPlus, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react'
import { useNoteStore } from '../../stores/useNoteStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { NoteItem } from '../../components/note/NoteItem'
import { NoteEditor } from '../../components/note/NoteEditor'
import { Badge, Button, EmptyState, Input, Section, Sheet, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'
import { noteTitle } from '../../utils/note'
import { recordActivity } from '../../services/activity'
import { createId, formatHM, friendlyDate, todayISO, nowISO } from '../../utils/id'
import type { Note } from '../../types/entities'

export function NotesTab() {
  const notes = useNoteStore((s) => s.items)
  const toast = useToast().toast
  const [editing, setEditing] = useState<Note | null>(null)
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<Note | null>(null)
  const [kindFilter, setKindFilter] = useState<'all' | 'note' | 'inspiration'>('all')
  const [query, setQuery] = useState('')

  // 搜索命中标题（含正文首行推导）/正文/标签
  const q = query.trim().toLowerCase()
  const list = notes
    .filter((n) => kindFilter === 'all' || n.kind === kindFilter)
    .filter(
      (n) =>
        !q ||
        noteTitle(n).toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))

  const openEditor = (n: Note | null) => {
    setEditing(n)
    setOpen(true)
  }
  const save = async (n: Note) => {
    await useNoteStore.getState().save(n)
  }
  const remove = async (n: Note) => {
    await useNoteStore.getState().remove(n.id)
    setDetail(null)
    toast('已删除')
  }
  const togglePin = async (n: Note) => {
    await useNoteStore.getState().update(n.id, { pinned: !n.pinned })
    setDetail((d) => (d && d.id === n.id ? { ...d, pinned: !n.pinned } : d))
  }
  /** 笔记 → 待办（闭环：随手记的东西可以变成要做的事） */
  const toTask = async (n: Note) => {
    const now = nowISO()
    const title = noteTitle(n)
    await useTaskStore.getState().add({
      id: createId(),
      title,
      description: n.body || undefined,
      done: false,
      priority: 'mid',
      dueDate: todayISO(),
      tags: n.tags,
      repeat: 'none',
      monthlyDay: null,
      weeklyDay: null,
      projectId: n.projectId ?? null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    void recordActivity({ entityType: 'note', entityId: n.id, title: `笔记转待办：${title.slice(0, 26)}` })
    toast('已转为今日待办 → 行', 'success')
    setDetail(null)
  }

  return (
    <Section
      title="记事本"
      hint={`${list.length} / ${notes.length} 条`}
      action={
        <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
          <Plus size={14} /> 添加
        </Button>
      }
    >
      {/* 搜索 + 类型筛选：此前只有筛选，笔记一多就找不回来 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="搜索标题 / 正文 / 标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="!pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-tile border border-line bg-nested/50 p-0.5">
          {(['all', 'note', 'inspiration'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={cn(
                'rounded-control px-2.5 py-1 text-xs transition-colors',
                kindFilter === k ? 'bg-paper text-ink' : 'text-ink-muted',
              )}
            >
              {k === 'all' ? '全部' : k === 'note' ? '记录' : '灵感'}
            </button>
          ))}
        </div>
      </div>

      {list.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              onOpen={setDetail}
              onEdit={openEditor}
              onDelete={remove}
              onTogglePin={togglePin}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={notes.length === 0 ? '还没有记录' : '没有匹配的记录'}
          desc={notes.length === 0 ? '随手记下想法、灵感或待整理内容' : '换个关键词或切回「全部」'}
        />
      )}

      {/* 笔记详情：移动端主要入口（点整卡打开） */}
      <Sheet open={detail != null} onClose={() => setDetail(null)} title={detail ? noteTitle(detail) : ''}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={detail.kind === 'inspiration' ? 'cinnabar' : 'plain'}>
                {detail.kind === 'inspiration' ? '灵感' : '笔记'}
              </Badge>
              {detail.pinned && <Badge tone="bronze">已置顶</Badge>}
              <span className="tabular text-xs text-ink-faint">
                {friendlyDate(detail.createdAt.slice(0, 10))} · {formatHM(detail.createdAt)}
              </span>
            </div>
            {detail.body ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{detail.body}</p>
            ) : (
              <p className="text-sm text-ink-faint">（无正文）</p>
            )}
            {detail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((t) => (
                  <span key={t} className="text-xs text-ink-faint">#{t}</span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button variant="secondary" size="sm" onClick={() => togglePin(detail)}>
                <Pin size={13} /> {detail.pinned ? '取消置顶' : '置顶'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => toTask(detail)}>
                <ListPlus size={13} /> 转待办
              </Button>
              <Button variant="danger" size="sm" onClick={() => remove(detail)}>
                <Trash2 size={13} /> 删除
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const target = detail
                  setDetail(null)
                  openEditor(target)
                }}
              >
                <Pencil size={13} /> 编辑
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <NoteEditor
        open={open}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        note={editing}
        defaultKind="note"
        onSave={save}
      />
    </Section>
  )
}
