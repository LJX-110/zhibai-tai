/**
 * NoteItem —— 笔记/灵感条目
 * 整卡可点开详情：移动端此前除悬停按钮外没有任何入口，笔记只能看不能改。
 */
import { Pencil, Pin, Trash2 } from 'lucide-react'
import type { Note } from '../../types/entities'
import { cn } from '../../utils/cn'
import { Badge } from '../ui/Badge'
import { formatHM } from '../../utils/id'
import { noteTitle } from '../../utils/note'

export interface NoteItemProps {
  note: Note
  /** 点整卡打开详情（可选；不传则不可点） */
  onOpen?: (note: Note) => void
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
  onTogglePin: (note: Note) => void
}

export function NoteItem({ note, onOpen, onEdit, onDelete, onTogglePin }: NoteItemProps) {
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(note) : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(note)
              }
            }
          : undefined
      }
      className={cn(
        'group relative overflow-hidden rounded-tile border border-line bg-raised p-4 pl-4.5 transition-all duration-fast hover:-translate-y-px hover:shadow-soft',
        note.pinned && 'border-bronze/35 bg-paper/50',
        onOpen && 'cursor-pointer',
      )}
    >
      {/* 左侧签条：灵感朱砂 / 笔记鎏金 */}
      <span
        className={cn(
          'absolute inset-y-2.5 left-0 w-[3px] rounded-full',
          note.kind === 'inspiration' ? 'bg-cinnabar/60' : 'bg-bronze/55',
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {note.pinned && (
              <Pin size={13} className="shrink-0 text-bronze" />
            )}
            <span className="scribal-title truncate text-base text-ink">{noteTitle(note)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone={note.kind === 'inspiration' ? 'cinnabar' : 'plain'}>
              {note.kind === 'inspiration' ? '灵感' : '笔记'}
            </Badge>
            {note.tags?.map((t) => (
              <span key={t} className="text-[11px] text-ink-faint">
                #{t}
              </span>
            ))}
            <span className="tabular text-[11px] text-ink-faint">
              {formatHM(note.createdAt)}
            </span>
          </div>
        </div>
        {/* hover-reveal：仅鼠标设备悬停显现，触屏常显；点按钮不触发整卡打开 */}
        <div
          className="hover-reveal flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button className="rounded-[4px] border border-line bg-raised p-1.5 text-ink-muted hover:border-bronze/50 hover:text-bronze" onClick={() => onTogglePin(note)} aria-label="置顶">
            <Pin size={13} />
          </button>
          <button className="rounded-[4px] border border-line bg-raised p-1.5 text-ink-muted hover:border-teal/50 hover:text-teal" onClick={() => onEdit(note)} aria-label="编辑">
            <Pencil size={13} />
          </button>
          <button className="rounded-[4px] border border-line bg-raised p-1.5 text-ink-muted hover:border-cinnabar/50 hover:text-cinnabar" onClick={() => onDelete(note)} aria-label="删除">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {note.body && (
        <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
          {note.body}
        </p>
      )}
    </div>
  )
}
