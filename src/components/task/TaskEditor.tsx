/**
 * TaskEditor —— 待办新增/编辑表单（Dialog）
 */
import { PRIORITY_LABEL, PRIORITY_ORDER } from './shared'
import { useState } from 'react'
import type { Priority, Repeat, Task } from '../../types/entities'
import { createId, isFixedSchedule, todayISO, nowISO } from '../../utils/id'
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
  weeklyDay: null as number | null,
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
      weeklyDay: task?.weeklyDay ?? null,
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
    const now = nowISO()
    const id = task?.id ?? createId()
    // 锚点只在对应重复方式下成立（切换重复方式时旧锚点必须清掉，否则会变成
    // "每日 + 每月 27 号"这种两个分组都想收留的混合体）
    const monthlyDay = form.repeat === 'monthly' ? form.monthlyDay : null
    const weeklyDay = form.repeat === 'weekly' ? form.weeklyDay : null
    const fixed = isFixedSchedule({ repeat: form.repeat, monthlyDay, weeklyDay })
    const tags = form.tagsText
      .split(/[\s,，]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    onSave({
      id,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      done: task?.done ?? false,
      priority: form.priority,
      dueDate: form.dueDate || null,
      tags,
      repeat: form.repeat,
      monthlyDay,
      weeklyDay,
      /* 固定任务记下**系列标识**（= 自身 id），展示层与清理逻辑靠它把各期认成一件事。
         取 `task?.seriesId ?? id`：已有值就沿用（编辑不得悄悄换系列），
         存量老任务没有这个字段 → 借这次编辑顺便补上，等于就地完成迁移。
         由固定改回普通任务则置空，不留一个再也不会被读到的字段。 */
      seriesId: fixed ? (task?.seriesId ?? id) : null,
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
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
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
          ) : form.repeat === 'weekly' ? (
            <Select
              value={form.weeklyDay ?? ''}
              onChange={(e) => {
                const v = e.target.value
                const n = Number(v)
                // 与 monthlyDay 同一校验风格：非法 / 越界一律回退 null
                setForm({
                  ...form,
                  weeklyDay: v === '' || !Number.isFinite(n) || n < 0 || n > 6 ? null : n,
                })
              }}
              aria-label="每周几"
            >
              <option value="">每周几</option>
              <option value="0">周日</option>
              <option value="1">周一</option>
              <option value="2">周二</option>
              <option value="3">周三</option>
              <option value="4">周四</option>
              <option value="5">周五</option>
              <option value="6">周六</option>
            </Select>
          ) : form.repeat === 'daily' ? (
            // 每日固定不需要锚点（"每天"本身没有几号/周几可言），
            // 占住这一格说明清楚，免得用户以为漏了什么没填
            <div className="flex items-center px-1 text-xs text-ink-faint" aria-hidden>
              每天都提醒
            </div>
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
