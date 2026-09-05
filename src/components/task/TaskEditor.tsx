/**
 * TaskEditor —— 待办新增/编辑表单（Dialog）
 */
import { useState } from 'react'
import type { Priority, Repeat, Task } from '../../types/entities'
import { createId, todayISO } from '../../utils/id'
import { useCourseStore } from '../../stores/useStudyStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Input, Select, Textarea } from '../ui/Field'

export interface TaskEditorProps {
  open: boolean
  onClose: () => void
  /** 传入待办则编辑，否则新增 */
  task?: Task | null
  onSave: (task: Task) => void
}

const EMPTY = {
  title: '',
  description: '',
  priority: 'mid' as Priority,
  dueDate: '',
  repeat: 'none' as Repeat,
  monthlyDay: null as number | null,
  tagsText: '',
  projectId: '',
  courseId: '',
}

export function TaskEditor({ open, onClose, task, onSave }: TaskEditorProps) {
  const courses = useCourseStore((s) => s.items)
  const projects = useProjectStore((s) => s.items)
  const [form, setForm] = useState({ ...EMPTY })
  /** 打开瞬间以渲染期守卫重置表单（替代 effect：少一次级联渲染） */
  const [seeded, setSeeded] = useState<{ open: boolean; key: Task | null }>({
    open: false,
    key: null,
  })
  const seedKey = task ?? null
  if (open && !(seeded.open && seeded.key === seedKey)) {
    setSeeded({ open: true, key: seedKey })
    setForm({
      title: task?.title ?? '',
      description: task?.description ?? '',
      priority: task?.priority ?? 'mid',
      dueDate: task?.dueDate ?? '',
      repeat: task?.repeat ?? 'none',
      monthlyDay: task?.monthlyDay ?? null,
      tagsText: (task?.tags ?? []).join(' '),
      projectId: task?.projectId ?? '',
      courseId: task?.courseId ?? '',
    })
  }
  if (!open && seeded.open) {
    setSeeded({ open: false, key: seedKey })
  }

  const submit = () => {
    if (!form.title.trim()) return
    const now = new Date().toISOString()
    const tags = form.tagsText
      .split(/[\s,，]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    onSave({
      id: task?.id ?? createId(),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      done: task?.done ?? false,
      priority: form.priority,
      dueDate: form.dueDate || null,
      tags,
      repeat: form.repeat,
      monthlyDay: form.repeat === 'monthly' ? form.monthlyDay : null,
      projectId: form.projectId || null,
      courseId: form.courseId || null,
      createdAt: task?.createdAt ?? now,
      updatedAt: now,
      completedAt: task?.completedAt ?? null,
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? '改待办' : '新待办'}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={!form.title.trim()}>
            {task ? '保存' : '添加'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          autoFocus
          placeholder="要做什么…"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Textarea
          placeholder="补充描述（可选）"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
            aria-label="优先级"
          >
            <option value="high">急</option>
            <option value="mid">中</option>
            <option value="low">缓</option>
          </Select>
          <Select
            value={form.repeat}
            onChange={(e) => setForm({ ...form, repeat: e.target.value as Repeat })}
            aria-label="重复"
          >
            <option value="none">不重复</option>
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </Select>
          {form.repeat === 'monthly' ? (
            <Input
              type="number"
              min={1}
              max={31}
              placeholder="每月几号"
              value={form.monthlyDay ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value)
                setForm({ ...form, monthlyDay: Number.isFinite(v) && v >= 1 && v <= 31 ? v : null })
              }}
              aria-label="每月几号"
            />
          ) : (
            <Input
              type="date"
              min={todayISO()}
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              aria-label="截止日期"
            />
          )}
          <Input
            placeholder="#标签"
            value={form.tagsText}
            onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            aria-label="关联项目"
          >
            <option value="">无关联项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            aria-label="关联课程"
          >
            <option value="">无关联课程</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      </div>
    </Dialog>
  )
}
