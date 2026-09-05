/**
 * NoteItem —— 笔记/灵感条目
 */
import { Pencil, Pin, Trash2 } from 'lucide-react'
import type { Note } from '../../types/entities'
import { cn } from '../../utils/cn'
import { Badge } from '../ui/Badge'
import { formatHM } from '../../utils/id'

export interface NoteItemProps {
  note: Note
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
  onTogglePin: (note: Note) => void
}

export function NoteItem({ note, onEdit, onDelete, onTogglePin }: NoteItemProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-tile border border-line bg-raised p-4 pl-4.5 transition-all duration-fast hover:-translate-y-px hover:shadow-soft',
        note.pinned && 'border-bronze/35 bg-panel',
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
            <span className="scribal-title truncate text-base text-ink">
              {note.title || '（无题）'}
            </span>
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
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
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
