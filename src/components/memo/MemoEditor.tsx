/**
 * MemoEditor —— 「守墨」的写入弹层
 *
 * 守墨只收一段纯文本：
 *  · **回车是换行**，不是保存（速记经常要分行）；保存走按钮或 Ctrl/⌘ + Enter；
 *  · 删除要二次确认 —— 速记没有回收站，点错就真没了；
 *  · 写入失败（存储满 / 隐私模式）时**不关弹层**，否则用户刚写的字会一起消失。
 */
import { useState } from 'react'
import type { Note } from '../../types/entities'
import { createId, nowISO } from '../../utils/id'
import { withDerivedTitle } from '../../utils/note'
import { Button } from '../ui/Button'
import { Sheet } from '../ui/Sheet'
import { Textarea } from '../ui/Field'

export interface MemoEditorProps {
  open: boolean
  onClose: () => void
  /** 传 null = 新建 */
  memo: Note | null
  onSave: (memo: Note) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

export function MemoEditor({ open, onClose, memo, onSave, onDelete }: MemoEditorProps) {
  const [body, setBody] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** 打开瞬间以渲染期守卫重置表单（与 NoteEditor 同一写法，省一次级联 effect） */
  const [seeded, setSeeded] = useState<{ open: boolean; key: Note | null }>({ open: false, key: null })

  if (open && !(seeded.open && seeded.key === memo)) {
    setSeeded({ open: true, key: memo })
    setBody(memo?.body ?? '')
    setConfirmDelete(false)
  }
  if (!open && seeded.open) setSeeded({ open: false, key: memo })

  const save = async () => {
    const text = body.trim()
    if (!text) return
    const now = nowISO()
    const ok = await onSave(
      withDerivedTitle({
        id: memo?.id ?? createId(),
        kind: 'memo',
        title: '',
        body: text,
        tags: [],
        pinned: false,
        createdAt: memo?.createdAt ?? now,
        updatedAt: now,
      }),
    )
    if (ok) onClose()
  }

  const remove = async () => {
    if (!memo) return
    if (await onDelete(memo.id)) onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={memo ? '改这条速记' : '记一笔'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={!body.trim()} onClick={() => void save()}>
            {memo ? '保存' : '记下'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Textarea
          autoFocus
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // 中文输入法选词时按 Enter 是确认候选，不能当成快捷键
            const composing = e.nativeEvent.isComposing || e.keyCode === 229
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !composing) {
              e.preventDefault()
              void save()
            }
          }}
          placeholder="随手写下今天要记住的事…"
          className="min-h-[200px]"
        />
        <p className="hidden text-xs text-ink-faint md:block">回车换行 · Ctrl+Enter 保存</p>

        {memo &&
          (confirmDelete ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2">
              <span className="text-xs text-cinnabar">删除后无法恢复</span>
              <div className="flex gap-2">
                <Button size="sm" variant="tertiary" onClick={() => setConfirmDelete(false)}>
                  再想想
                </Button>
                <Button size="sm" variant="danger" onClick={() => void remove()}>
                  确认删除
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-ink-faint underline-offset-2 transition-colors hover:text-cinnabar hover:underline"
            >
              删除这条
            </button>
          ))}
      </div>
    </Sheet>
  )
}
