/**
 * 学 · 单次课调整（停课 / 调课 / 恢复）
 *
 * ## 解决什么
 * 此前要停一次课只能**删时段**或**改周次** —— 破坏性操作，而且**改完提醒照样响**。
 * 根因不是提醒算错，而是没有"取消某一次课"这个概念（用户报过「课次取消当周仍触发通知」）。
 * 后来又发现还缺另一半：**老师把周三那节挪到周五** —— 停课只能表达"不上了"，
 * 挪过去的新时间谁也认不出来。于是这里同时提供两种动作：
 *  · 停这一次 = 原时间空掉；
 *  · 调课     = 原时间空掉 + 新时间多出一节（时长沿用原节次）。
 * 两者**互斥**：同一次课不该既停又调，故已停/已调的格子只给「恢复」。
 *
 * ## 为什么做成独立弹层，而不是在课程表格子上加个叉
 *  · 格子本身是个 `<button>`（点开详情），里面再放按钮就是**嵌套按钮**（无效 HTML）；
 *  · 这是低频动作，不值得在每格常驻一个可点区域（还容易误触）。
 * 所以：格子只做**只读标记**（已停/已调走显示为划掉+变淡+状态文字），真正操作在这里。
 *
 * ## 为什么列"未来 7 天"
 * 停课与调课几乎都是近期的（"下周三老师有事"）。列全学期没有意义，反而找不到。
 */
import { useMemo, useState } from 'react'
import { Dialog, Button, Input, Select, useToast } from '../../components/ui'
import { daySlotsDetailed, currentWeek } from '../../services/study'
import { useCourseCancellationStore, useCourseRescheduleStore, useCourseStore } from '../../stores/useStudyStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { createId, nowISO, parseISO, toISODate } from '../../utils/id'
import { cn } from '../../utils/cn'

/** 往后看几天 */
const AHEAD_DAYS = 7
/** 调课的可选目标日范围（往后看多少天） */
const MOVE_AHEAD_DAYS = 14

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** "HH:mm" → 当日分钟数（与 services/study 的私有实现同源；此处要算时长，故本地再写一份） */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN
  return h * 60 + m
}

/** 分钟数 → "HH:mm"（越界自动夹到 00:00–23:59） */
function toHHMM(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 未来 N 天（含今天），带上周几标签 */
function nextDays(count: number): { date: string; label: string }[] {
  const base = new Date()
  const out: { date: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    out.push({
      date: toISODate(d),
      label: `${WEEKDAYS[d.getDay()]}${i === 0 ? '（今天）' : i === 1 ? '（明天）' : ''}`,
    })
  }
  return out
}

export function AdjustClassDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const courses = useCourseStore((s) => s.items)
  const cancellations = useCourseCancellationStore((s) => s.items)
  const reschedules = useCourseRescheduleStore((s) => s.items)
  const termStartDate = useSettingsStore((s) => s.termStartDate)
  const addCancellation = useCourseCancellationStore((s) => s.add)
  const removeCancellation = useCourseCancellationStore((s) => s.remove)
  const addReschedule = useCourseRescheduleStore((s) => s.add)
  const removeReschedule = useCourseRescheduleStore((s) => s.remove)
  const toast = useToast().toast

  /** 正在编辑调课的那一行（键为 `courseId|date|start`）；null = 没有展开 */
  const [editing, setEditing] = useState<string | null>(null)
  /** 编辑中的目标日 / 目标开始时间 */
  const [toDate, setToDate] = useState('')
  const [toStart, setToStart] = useState('')

  /** 未来 7 天里"本来有课"的那些天（没课的日子不列，免得刷屏） */
  const days = useMemo(() => {
    const base = new Date()
    const out: { date: string; label: string; slots: ReturnType<typeof daySlotsDetailed> }[] = []
    for (let i = 0; i < AHEAD_DAYS; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
      const date = toISODate(d)
      const week = currentWeek(termStartDate, date)
      const slots = daySlotsDetailed(courses, d.getDay(), week, date, cancellations, reschedules)
      if (slots.length === 0) continue
      out.push({
        date,
        label: i === 0 ? '今天' : i === 1 ? '明天' : `${WEEKDAYS[d.getDay()]}`,
        slots,
      })
    }
    return out
  }, [courses, cancellations, reschedules, termStartDate])

  /** 调课的目标日选项：近 14 天，去掉原定那一天（挪回原地等于没调） */
  const moveDays = useMemo(() => nextDays(MOVE_AHEAD_DAYS), [])

  const cancel = async (courseId: string, date: string, start: string, name: string) => {
    await addCancellation({ id: createId(), courseId, date, start, createdAt: nowISO() })
    toast(`已停 ${date.slice(5)} ${start} 的${name}`, 'success')
  }

  const restoreCancel = async (id: string, name: string) => {
    await removeCancellation(id)
    toast(`${name}已恢复`, 'success')
  }

  /** 开始编辑调课：默认挪到明天、时间不变（多数情况只是换个日子） */
  const beginMove = (key: string, date: string, start: string) => {
    const d = parseISO(date)
    d.setDate(d.getDate() + 1)
    setToDate(toISODate(d))
    setToStart(start)
    setEditing(key)
  }

  /**
   * 确认调课。`toEnd` 按**原节次时长**算出并落库 ——
   * 读取方（取课点/课程表/提醒）拿到的是完整时段，不必回原课程里反查时长
   * （原时段可能已被编辑甚至删除，那时候就推不出来了）。
   */
  const confirmMove = async (
    courseId: string,
    date: string,
    start: string,
    end: string,
    name: string,
  ) => {
    if (!toDate || !toStart) return
    const span = toMinutes(end) - toMinutes(start)
    const toEnd = toHHMM(toMinutes(toStart) + (Number.isFinite(span) && span > 0 ? span : 45))
    await addReschedule({
      id: createId(),
      courseId,
      date,
      start,
      toDate,
      toStart,
      toEnd,
      createdAt: nowISO(),
    })
    setEditing(null)
    toast(`已把 ${date.slice(5)} ${start} 的${name}调到 ${toDate.slice(5)} ${toStart}`, 'success')
  }

  const undoMove = async (id: string, name: string) => {
    await removeReschedule(id)
    toast(`${name}已调回`, 'success')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="调课 / 停课"
      footer={
        <Button variant="secondary" onClick={onClose}>
          完成
        </Button>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-ink-faint">
        改的是**这一次**课，不动课程本身的排课。停掉的课不会再提醒；调走的课按新时间提醒。
        想彻底调整请用「管理」改周次或时段。
      </p>
      {days.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-faint">未来 7 天没有课</p>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date}>
              <div className="mb-1 text-xs text-ink-muted">
                {d.label} · {d.date.slice(5)}
              </div>
              <div className="space-y-1">
                {d.slots.map(({ course, slot, canceled, movedTo, movedIn }) => {
                  const key = `${course.id}|${d.date}|${slot.start}`
                  const cancelRecord = cancellations.find(
                    (c) => c.courseId === course.id && c.date === d.date && c.start === slot.start,
                  )
                  const moveRecord = reschedules.find(
                    (r) => r.courseId === course.id && r.date === d.date && r.start === slot.start,
                  )
                  const off = canceled || Boolean(movedTo)
                  return (
                    <div key={key} className="rounded-tile border border-line">
                      <div className={cn('flex items-center gap-2 px-2.5 py-1.5', off && 'bg-raised')}>
                        <span className="tabular shrink-0 text-xs text-ink-faint">{slot.start}</span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            off ? 'text-ink-faint line-through' : 'text-ink',
                          )}
                        >
                          {course.name}
                          {course.room ? ` · ${course.room}` : ''}
                        </span>
                        {movedIn && <span className="shrink-0 text-xs text-teal">调课</span>}
                        {canceled && cancelRecord ? (
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => void restoreCancel(cancelRecord.id, course.name)}
                          >
                            恢复
                          </Button>
                        ) : moveRecord ? (
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => void undoMove(moveRecord.id, course.name)}
                          >
                            恢复
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="tertiary"
                              onClick={() => beginMove(key, d.date, slot.start)}
                            >
                              调课
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void cancel(course.id, d.date, slot.start, course.name)}
                            >
                              停这一次
                            </Button>
                          </>
                        )}
                      </div>

                      {/* 已调走：把"调去哪了"写出来，否则用户只看到这节被划掉，无从确认 */}
                      {movedTo && (
                        <div className="border-t border-line px-2.5 py-1.5 text-xs text-bronze">
                          已调至 {movedTo.toDate.slice(5)} {movedTo.toStart}–{movedTo.toEnd}
                        </div>
                      )}

                      {/* 调课编辑行：目标日 + 开始时间。时长沿用原节次，不给用户再填一遍的机会 */}
                      {editing === key && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-line px-2.5 py-1.5">
                          <Select
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="!w-auto !py-1 text-sm"
                            aria-label="调到哪一天"
                          >
                            {moveDays
                              .filter((x) => x.date !== d.date)
                              .map((x) => (
                                <option key={x.date} value={x.date}>
                                  {x.date.slice(5)} {x.label}
                                </option>
                              ))}
                          </Select>
                          <Input
                            type="time"
                            value={toStart}
                            onChange={(e) => setToStart(e.target.value)}
                            className="!w-auto !py-1 text-sm"
                            aria-label="调到几点"
                          />
                          <span className="text-xs text-ink-faint">
                            {slot.start}–{slot.end} 等长
                          </span>
                          <div className="ml-auto flex items-center gap-1">
                            <Button size="sm" variant="tertiary" onClick={() => setEditing(null)}>
                              取消
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={!toDate || !toStart}
                              onClick={() =>
                                void confirmMove(
                                  course.id,
                                  d.date,
                                  slot.start,
                                  slot.end,
                                  course.name,
                                )
                              }
                            >
                              确定
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
