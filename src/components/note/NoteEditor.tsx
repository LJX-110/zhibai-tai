/**
 * NoteEditor —— 笔记/灵感 新增编辑（Sheet，移动端友好）
 */
import { useEffect, useState } from 'react'
import type { Note } from '../../types/entities'
import { createId } from '../../utils/id'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

export interface NoteEditorProps {
  open: boolean
  onClose: () => void
  note?: Note | null
  /** 默认 kind */
  defaultKind?: Note['kind']
  onSave: (note: Note) => void
}

export function NoteEditor({ open, onClose, note, defaultKind = 'note', onSave }: NoteEditorProps) {
  const [kind, setKind] = useState<Note['kind']>('note')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagsText, setTagsText] = useState('')

  useEffect(() => {
    if (open) {
      setKind(note?.kind ?? defaultKind)
      setTitle(note?.title ?? '')
      setBody(note?.body ?? '')
      setTagsText((note?.tags ?? []).join(' '))
    }
  }, [open, note, defaultKind])

  const submit = () => {
    const now = new Date().toISOString()
    const tags = tagsText.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean)
    onSave({
      id: note?.id ?? createId(),
      kind,
      title: title.trim(),
      body: body.trim(),
      tags,
      pinned: note?.pinned ?? false,
      createdAt: note?.createdAt ?? now,
      updatedAt: now,
    })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={note ? '改记录' : kind === 'inspiration' ? '记一条灵感' : '写一条记录'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit}>{note ? '保存' : '添加'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          {(['note', 'inspiration'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={
                'flex-1 rounded-tile border px-3 py-2 text-sm transition-colors ' +
                (kind === k
                  ? 'border-cinnabar/50 bg-cinnabar/5 text-ink'
                  : 'border-line text-ink-muted hover:border-line-strong')
              }
            >
              {k === 'note' ? '记录' : '灵感'}
            </button>
          ))}
        </div>
        <Input
          autoFocus
          placeholder="标题（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          placeholder={kind === 'inspiration' ? '灵光一现，记下来…' : '写点什么…'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Input
          placeholder="#标签（空格分隔）"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />
      </div>
    </Sheet>
  )
}
