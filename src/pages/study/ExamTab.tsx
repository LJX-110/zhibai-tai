/**
 * 学 · ExamTab（从 StudyPage 拆出，见 docs/编码规范.md 路线图第 2 步）
 */
import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useCourseStore, useExamStore } from '../../stores/useStudyStore'

import {
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
  Section,
} from '../../components/ui'

import { createId, friendlyDate, todayISO } from '../../utils/id'

import type { Exam } from '../../types/entities'

export function ExamTab() {
  const exams = useExamStore((s) => s.items)
  const courses = useCourseStore((s) => s.items)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')

  const openEditor = (e: Exam | null) => {
    setEditing(e)
    setTitle(e?.title ?? '')
    setCourseId(e?.courseId ?? '')
    setDate(e?.date ?? todayISO())
    setTime(e?.time ?? '')
    setLocation(e?.location ?? '')
    setOpen(true)
  }

  const save = async () => {
    if (!title.trim()) return
    await useExamStore.getState().save({
      id: editing?.id ?? createId(),
      title: title.trim(),
      courseId: courseId || null,
      date,
      time: time || undefined,
      location: location.trim() || undefined,
      note: undefined,
    })
    setOpen(false)
  }

  const list = exams.slice().sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Section
      title="考试"
      hint={`${list.length} 场`}
      action={
        <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
          <Plus size={14} /> 考试
        </Button>
      }
    >
      {list.length > 0 ? (
        <div>
          {list.map((e) => (
            <div key={e.id} className="row">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-ink">{e.title}</span>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-faint">
                  {courses.find((c) => c.id === e.courseId)?.name && (
                    <span>{courses.find((c) => c.id === e.courseId)?.name}</span>
                  )}
                  <span className="tabular">{friendlyDate(e.date)}</span>
                  {e.time && <span className="tabular">{e.time}</span>}
                  {e.location && <span>{e.location}</span>}
                </div>
              </div>
              <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised" onClick={() => openEditor(e)} aria-label="编辑">
                <Pencil size={14} />
              </button>
              <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => useExamStore.getState().remove(e.id)} aria-label="删除">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="暂无考试" action={<Button variant="primary" onClick={() => openEditor(null)}><Plus size={14} /> 添加考试</Button>} />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? '改考试' : '新考试'}>
        <div className="space-y-3">
          <Input autoFocus placeholder="考试名称" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">无关联课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input placeholder="考场" value={location} onChange={(e) => setLocation(e.target.value)} />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
