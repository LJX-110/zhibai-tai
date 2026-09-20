/**
 * 学 · HomeworkTab（从 StudyPage 拆出，见 docs/编码规范.md 路线图第 2 步）
 */
import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Plus,
  Trash2,
  Pencil,
} from 'lucide-react'
import { useCourseStore, useHomeworkStore } from '../../stores/useStudyStore'

import {
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
  Section,
} from '../../components/ui'
import { Seal } from '../../components/ui/Seal'
import { SealCheckbox } from '../../components/ui/SealCheckbox'
import { playSound } from '../../services/sound'
import { createId, friendlyDate, nowISO } from '../../utils/id'

import type { Homework } from '../../types/entities'
import { cn } from '../../utils/cn'

export function HomeworkTab() {
  const homeworks = useHomeworkStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Homework | null>(null)
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [dueDate, setDueDate] = useState('')
  /** 刚落印的那一行 id —— 与待办共用同一套「完成即落印」语言 */
  const [stampId, setStampId] = useState<string | null>(null)
  /** 落印定时器句柄：用 ref 持有，便于卸载时清除，避免组件在 720ms 内卸载后对已卸载组件 setState */
  const stampTimerRef = useRef<number | undefined>(undefined)
  // 卸载时若有未触发的落印定时器，清掉它（否则 720ms 后才 fire，会对已卸载组件 setState）
  useEffect(() => () => {
    if (stampTimerRef.current) window.clearTimeout(stampTimerRef.current)
  }, [])
  /** 已完成区是否展开（默认收起，与「行 · 待办」同一做法） */
  const [showDone, setShowDone] = useState(false)

  const openEditor = (h: Homework | null) => {
    setEditing(h)
    setTitle(h?.title ?? '')
    setCourseId(h?.courseId ?? '')
    setDueDate(h?.dueDate ?? '')
    setOpen(true)
  }

  const save = async () => {
    if (!title.trim()) return
    await useHomeworkStore.getState().save({
      id: editing?.id ?? createId(),
      title: title.trim(),
      courseId: courseId || null,
      done: editing?.done ?? false,
      dueDate: dueDate || null,
      note: undefined,
      createdAt: editing?.createdAt ?? nowISO(),
    })
    setOpen(false)
  }

  const toggle = async (h: Homework) => {
    const willDone = !h.done
    await useHomeworkStore.getState().update(h.id, { done: willDone })
    // 只在「未交 → 已交」这一瞬间落印；取消勾选不落印
    if (!willDone) return
    setStampId(h.id)
    playSound('seal')
    // 先清掉上一次可能未触发的定时器（连点/切换作业时），再起新的，避免 stray setState
    if (stampTimerRef.current) window.clearTimeout(stampTimerRef.current)
    stampTimerRef.current = window.setTimeout(() => setStampId(null), 720)
  }

  const byDue = (a: Homework, b: Homework) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
  const undone = homeworks.filter((h) => !h.done).sort(byDue)
  const doneList = homeworks.filter((h) => h.done).sort(byDue)

  /** 单行渲染 —— 未交段与已完成段共用，两边的语言必须完全一致 */
  const rowOf = (h: Homework) => (
    <div key={h.id} className="row relative">
      {/* 作业完成 = 圆形印章勾选（与待办共用 SealCheckbox，同一形制同一份实现） */}
      <SealCheckbox checked={h.done} onChange={() => toggle(h)} char="毕" />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-sm', h.done ? 'text-ink-faint' : 'text-ink')}>{h.title}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-faint">
          {courses.find((c) => c.id === h.courseId)?.name && (
            <span>{courses.find((c) => c.id === h.courseId)?.name}</span>
          )}
          {h.dueDate && <span className="tabular">{friendlyDate(h.dueDate)}</span>}
        </div>
      </div>
      <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => openEditor(h)} aria-label="编辑">
        <Pencil size={14} />
      </button>
      <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => useHomeworkStore.getState().remove(h.id)} aria-label="删除">
        <Trash2 size={14} />
      </button>

      {/* 落印覆盖层：与待办「事毕」同形制，只在该行刚被标记完成时盖下 */}
      {stampId === h.id && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="seal-stamp flex items-center gap-2 rounded-tile bg-paper/85 px-3 py-1.5 shadow-float">
            <Seal size={22} char="毕" tone="cinnabar" />
            <span className="scribal text-sm text-cinnabar">交毕</span>
          </span>
        </span>
      )}
    </div>
  )

  return (
    <Section
      title="作业"
      hint={homeworks.length > 0 ? `未交 ${undone.length} · 已完成 ${doneList.length}` : '暂无'}
      action={
        <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
          <Plus size={14} /> 作业
        </Button>
      }
    >
      {homeworks.length === 0 ? (
        <EmptyState title="没有作业" action={<Button variant="primary" onClick={() => openEditor(null)}><Plus size={14} /> 添加作业</Button>} />
      ) : (
        <>
          {/* 未交：常显 —— 这才是要处理的部分 */}
          {undone.length > 0 ? (
            <div>{undone.map(rowOf)}</div>
          ) : (
            <p className="py-2 text-xs text-ink-faint">
              <CheckCircle2 size={13} className="mr-1 inline text-cinnabar" />
              全部已交
            </p>
          )}

          {/* 已完成：弱化为一行小字入口（与「行 · 待办」同一做法，不抢视觉权重） */}
          <div className="mt-3">
            <button
              onClick={() => setShowDone((v) => !v)}
              className="flex w-full items-center gap-2 py-1 text-xs text-ink-faint transition-colors hover:text-ink-muted"
              aria-expanded={showDone}
            >
              已完成 · {doneList.length}
              <span className="ml-auto text-xs">{showDone ? '收起' : '展开'}</span>
            </button>
            {showDone && doneList.length > 0 && <div>{doneList.map(rowOf)}</div>}
            {showDone && doneList.length === 0 && (
              <p className="py-2 text-xs text-ink-faint">尚无已完成作业</p>
            )}
          </div>
        </>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? '改作业' : '新作业'}>
        <div className="space-y-3">
          <Input autoFocus placeholder="作业内容" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">无关联课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>保存</Button>
        </div>
      </Dialog>
    </Section>
  )
}

/* ---------------- 考试 ---------------- */

