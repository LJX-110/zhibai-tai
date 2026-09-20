/**
 * 学 · CourseTab（从 StudyPage 拆出，见 docs/编码规范.md 路线图第 2 步）
 */
import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  Download,
  Plus,
  Trash2,
  Pencil,
  Eye,
} from 'lucide-react'
import { useCourseStore } from '../../stores/useStudyStore'
import { usePomodoroStore } from '../../stores/usePomodoroStore'

import { useInspectorStore } from '../../components/inspector/Inspector'

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
  Section,
  useToast,
} from '../../components/ui'

import { createId, todayISO, nowISO } from '../../utils/id'
import {
  MAX_WEEKS,
  buildWeeks,
  describeWeeks,
  slotsOverlap,
  type WeeksForm,
  type WeeksMode,
} from '../../services/study'
import type { Course, WeeklySlot } from '../../types/entities'
import { cn } from '../../utils/cn'
import { WEEKDAY_NAMES, WEEKDAY_SHORT, courseLabel } from './shared'

export function CourseTab({
  quickAdd,
  onBack,
}: {
  quickAdd?: { weekday: number; nonce: number } | null
  /** 返回课程表（本视图现在是课表的子页，不是独立页签） */
  onBack: () => void
}) {
  const courses = useCourseStore((s) => s.items)
  const sessions = usePomodoroStore((s) => s.items)
  const toast = useToast().toast
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [form, setForm] = useState({
    name: '',
    teacher: '',
    room: '',
    credit: '0',
    note: '',
  })
  const [slots, setSlots] = useState<WeeklySlot[]>([])
  const [slotWeekday, setSlotWeekday] = useState('1')
  const [slotStart, setSlotStart] = useState('08:00')
  const [slotEnd, setSlotEnd] = useState('09:40')
  const [slotWeeks, setSlotWeeks] = useState<WeeksForm>({ mode: 'all', from: 1, to: 16, custom: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const openEditor = (c: Course | null, presetWeekday?: number) => {
    setEditing(c)
    setForm({
      name: c?.name ?? '',
      teacher: c?.teacher ?? '',
      room: c?.room ?? '',
      credit: String(c?.credit ?? 0),
      note: c?.note ?? '',
    })
    setSlots(c?.schedule?.map((s) => ({ ...s })) ?? [])
    // 从课表格子进来时，带一节该周几的默认时段：打开即可改，不用再点「加一节」
    if (!c && presetWeekday != null) {
      setSlots([{ weekday: presetWeekday, start: '08:00', end: '09:40' }])
      setSlotWeekday(String(presetWeekday))
    }
    setSlotWeeks({ mode: 'all', from: 1, to: 16, custom: '' })
    setOpen(true)
  }

  /** 课表空位 → 直接开新课程的编辑器，并预填该周几 */
  const [lastQuickNonce, setLastQuickNonce] = useState(0)
  if (quickAdd && quickAdd.nonce !== lastQuickNonce) {
    setLastQuickNonce(quickAdd.nonce)
    openEditor(null, quickAdd.weekday)
  }

  const save = async () => {
    if (!form.name.trim()) return
    await useCourseStore.getState().save({
      id: editing?.id ?? createId(),
      name: form.name.trim(),
      teacher: form.teacher.trim() || undefined,
      room: form.room.trim() || undefined,
      schedule: slots,
      credit: Number(form.credit) || 0,
      note: form.note.trim() || undefined,
      createdAt: editing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    })
    setOpen(false)
  }

  const addSlot = () => {
    const start = slotStart || '08:00'
    const end = slotEnd || slotStart || '09:40'
    if (end <= start) {
      toast('结束时间要晚于开始时间', 'danger')
      return
    }
    const weeks = buildWeeks(slotWeeks)
    if (slotWeeks.mode === 'custom' && (!weeks || weeks.length === 0)) {
      toast('自定义周次没解析出有效周号（用逗号分隔，如 1,2,5）', 'danger')
      return
    }
    setSlots((s) => [...s, { weekday: Number(slotWeekday), start, end, weeks }])
  }

  /** 跨课程时段冲突：同一时段两门课，排课时就要看见，别等上课才发现 */
  const conflictHints = useMemo(() => {
    const out: string[] = []
    for (const other of courses) {
      if (other.id === editing?.id) continue
      for (const mine of slots) {
        for (const theirs of other.schedule ?? []) {
          if (slotsOverlap(mine, theirs)) {
            out.push(
              `${WEEKDAY_NAMES[mine.weekday]} ${mine.start}–${mine.end} 与「${other.name}」重叠`,
            )
          }
        }
      }
    }
    return [...new Set(out)].slice(0, 4)
  }, [courses, slots, editing?.id])

  /** 导出课表为 JSON（换设备、留底、改坏了能回滚） */
  const exportCourses = () => {
    const dump = {
      app: 'yishu-workbench',
      kind: 'courses',
      exportedAt: nowISO(),
      courses,
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zhibaitai-courses-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast(`已导出 ${courses.length} 门课程`, 'success')
  }

  /** 导入课表：同 id 覆盖、新 id 追加 */
  const importCourses = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const list = Array.isArray(parsed)
        ? parsed
        : ((parsed as { courses?: unknown }).courses ?? [])
      if (!Array.isArray(list) || list.length === 0) throw new Error('文件里没有课程数据')
      const now = nowISO()
      const incoming: Course[] = list
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
        .filter((c) => typeof c.name === 'string' && c.name.trim() !== '')
        .map((c) => ({
          id: typeof c.id === 'string' && c.id ? c.id : createId(),
          name: String(c.name).trim(),
          teacher: typeof c.teacher === 'string' ? c.teacher : undefined,
          room: typeof c.room === 'string' ? c.room : undefined,
          schedule: Array.isArray(c.schedule) ? (c.schedule as WeeklySlot[]) : [],
          credit: Number(c.credit) || 0,
          note: typeof c.note === 'string' ? c.note : undefined,
          createdAt: typeof c.createdAt === 'string' ? c.createdAt : now,
          updatedAt: now,
        }))
      if (incoming.length === 0) throw new Error('没有解析出有效课程（需含 name 字段）')
      await useCourseStore.getState().saveMany(incoming)
      toast(`已导入 ${incoming.length} 门课程`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '导入失败', 'danger')
    }
  }

  return (
    <Section
      title="课程管理"
      hint={`${courses.length} 门`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="tertiary" onClick={onBack}>
            <ChevronLeft size={13} /> 课程表
          </Button>
          <Button size="sm" variant="tertiary" onClick={exportCourses} disabled={courses.length === 0}>
            <Download size={13} /> 导出
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => fileRef.current?.click()}>
            <Plus size={13} /> 导入
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => openEditor(null)}>
            <Plus size={14} /> 课程
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importCourses(file)
            }}
          />
        </div>
      }
    >
      {courses.length > 0 ? (
        <div>
          {courses.map((c) => (
            <div key={c.id} className="row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{courseLabel(c)}</span>
                  <Badge tone="teal">{c.credit} 学分</Badge>
                  {(() => {
                    const mins = sessions
                      .filter((s) => s.type === 'focus' && s.courseId === c.id)
                      .reduce((a, s) => a + s.durationMin, 0)
                    return mins > 0 ? (
                      <span className="seal seal--active">累计学习 {mins} 分钟</span>
                    ) : null
                  })()}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                  {c.teacher && <span>师 · {c.teacher}</span>}
                  {c.room && <span>室 · {c.room}</span>}
                  {c.schedule?.map((sl, i) => (
                    <span key={i} className="tabular">
                      周{WEEKDAY_SHORT[sl.weekday]} {sl.start}–{sl.end}
                      {sl.weeks && sl.weeks.length > 0 && (
                        <span className="ml-1 text-bronze">{describeWeeks(sl.weeks)}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <button
                className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink"
                onClick={() => useInspectorStore.getState().open('course', c.id)}
                aria-label="详情"
              >
                <Eye size={14} />
              </button>
              <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink" onClick={() => openEditor(c)} aria-label="编辑">
                <Pencil size={14} />
              </button>
              <button className="touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar" onClick={() => useCourseStore.getState().remove(c.id)} aria-label="删除">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="还没有课程" action={<Button variant="primary" onClick={() => openEditor(null)}><Plus size={14} /> 添加课程</Button>} />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? '改课程' : '新课程'}>
        <div className="space-y-3">
          <Input autoFocus placeholder="课程名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="教师" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} />
            <Input placeholder="教室" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          </div>
          <Input type="number" min={0} step={0.5} placeholder="学分" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />

          {/* 排课：周几 + 起止 + 周次（单双周靠它表达） */}
          <div>
            <div className="mb-1 text-xs text-ink-muted">排课</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(slotWeekday)} onChange={(e) => setSlotWeekday(e.target.value)} className="!w-auto !py-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                  <option key={w} value={String(w)}>周{WEEKDAY_SHORT[w]}</option>
                ))}
              </Select>
              <Input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className="!w-auto !py-1.5 text-sm" aria-label="开始时间" />
              <Input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className="!w-auto !py-1.5 text-sm" aria-label="结束时间" />
              <Button size="sm" variant="secondary" onClick={addSlot}>＋ 加一节</Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-muted">周次</span>
              <div className="switch-pill flex gap-0.5 rounded-tile p-0.5">
                {(
                  [
                    ['all', '每周'],
                    ['odd', '单周'],
                    ['even', '双周'],
                    ['custom', '自定义'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setSlotWeeks((w) => ({ ...w, mode: k as WeeksMode }))}
                    className={cn(
                      'rounded-control px-2 py-1 text-xs transition-colors',
                      slotWeeks.mode === k ? 'switch-pill-active' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {slotWeeks.mode === 'odd' || slotWeeks.mode === 'even' ? (
                <span className="flex items-center gap-1 text-xs text-ink-faint">
                  第
                  <input
                    type="number"
                    min={1}
                    max={MAX_WEEKS}
                    value={slotWeeks.from}
                    onChange={(e) => setSlotWeeks((w) => ({ ...w, from: Number(e.target.value) }))}
                    className="w-12 rounded-control border border-line bg-raised px-1 py-0.5 text-center text-xs text-ink"
                    aria-label="起始周"
                  />
                  –
                  <input
                    type="number"
                    min={1}
                    max={MAX_WEEKS}
                    value={slotWeeks.to}
                    onChange={(e) => setSlotWeeks((w) => ({ ...w, to: Number(e.target.value) }))}
                    className="w-12 rounded-control border border-line bg-raised px-1 py-0.5 text-center text-xs text-ink"
                    aria-label="结束周"
                  />
                  周
                </span>
              ) : slotWeeks.mode === 'custom' ? (
                <input
                  value={slotWeeks.custom}
                  onChange={(e) => setSlotWeeks((w) => ({ ...w, custom: e.target.value }))}
                  placeholder="1,2,5,8"
                  className="w-28 rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink"
                  aria-label="自定义周次"
                />
              ) : null}
            </div>
            {slots.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {slots.map((s, i) => (
                  <span key={`${s.weekday}-${s.start}-${i}`} className="seal seal--active">
                    周{WEEKDAY_SHORT[s.weekday]} {s.start}
                    {s.weeks && s.weeks.length > 0 && ` · ${describeWeeks(s.weeks)}`}
                    <button onClick={() => setSlots((x) => x.filter((_, j) => j !== i))} className="ml-1 text-ink-faint hover:text-cinnabar">×</button>
                  </span>
                ))}
              </div>
            )}
            {conflictHints.length > 0 && (
              <div className="mt-2 space-y-1 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2">
                {conflictHints.map((h) => (
                  <div key={h} className="flex items-start gap-1.5 text-xs text-cinnabar">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {h}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Input placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" onClick={save} disabled={!form.name.trim()}>保存</Button>
        </div>
      </Dialog>
    </Section>
  )
}

/* ---------------- 作业 ---------------- */

