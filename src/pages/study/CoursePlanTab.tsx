/**
 * 学 · 学分 · 选课
 *
 * ## 这个页面只回答两个问题
 *  ① **我还差多少学分**（首屏就是三个数字：限选 / 公选 / 体育）
 *  ② **选课过程记在哪**（条目 / 候选 / 不可选 / 选课事项）
 *
 * ## 形态取舍（与上一版「课程统计」的区别）
 * 刻意不是 Dashboard：没有环形图、没有课时分布、没有卡片矩阵。
 * **课时信息不在这里重复** —— 课程的周几几点在 `Course.schedule` 里，课程表本来就在显示。
 * 成绩与出勤同理：数据模型没有可信来源，**如实不做**，不用估算填上。
 *
 * ## 数据从哪来
 * 全部来自 `CoursePlan`（条目）与 `CoursePlanMeta`（目标 / 事项）两张业务表 ——
 * 与 `Course`（正式课表）**互不依赖**：学分进度的真相在规划里，不去问课程表。
 *
 * 渲染件已按区域拆出：条目行 / 公选分组在 `./CoursePlanRow`，条目弹窗在 `./CoursePlanDialog`，
 * 中文字典与草稿类型在 `./plan-shared`。
 */
import { useState } from 'react'
import { ChevronLeft, Plus, Settings2, Trash2 } from 'lucide-react'
import { useCoursePlanMetaStore, useCoursePlanStore } from '../../stores/useCoursePlanStore'
import { planProgress, publicGroupsOf } from '../../services/study'
import type { CoursePlan, CoursePlanKind, CoursePlanStatus } from '../../types/entities'
import { Button, Dialog, Input, Section, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'
import { createId, nowISO } from '../../utils/id'
import { PlanDialog } from './CoursePlanDialog'
import { PlanRow, PublicList } from './CoursePlanRow'
import { KIND_LABEL, KIND_ORDER, emptyDraft, trim, type PlanDraft } from './plan-shared'

export function CoursePlanTab({ onBack }: { onBack: () => void }) {
  const items = useCoursePlanStore((s) => s.items)
  const removeItem = useCoursePlanStore((s) => s.remove)
  const saveItem = useCoursePlanStore((s) => s.save)
  const { goals, notes, setGoal, setNotes } = useCoursePlanMetaStore()
  const toast = useToast().toast

  const progress = planProgress(items, goals)
  const publicGroups = publicGroupsOf(items)

  /** 正在编辑 / 新增的条目（null = 弹窗关着） */
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  const ofKind = (kind: CoursePlanKind) => items.filter((c) => c.kind === kind)
  const byStatus = (status: CoursePlanStatus) => items.filter((c) => c.status === status)

  const openNew = (kind: CoursePlanKind, group = '') => {
    setEditingId(null)
    setDraft(emptyDraft(kind, group))
  }

  const openEdit = (c: CoursePlan) => {
    setEditingId(c.id)
    setDraft({
      kind: c.kind,
      group: c.group ?? '',
      title: c.title,
      credit: c.credit != null ? String(c.credit) : '',
      teacher: c.teacher ?? '',
      status: c.status,
      note: c.note ?? '',
    })
  }

  const saveDraft = async () => {
    if (!draft) return
    if (!draft.title.trim()) {
      toast('课程名不能为空', 'danger')
      return
    }
    const now = nowISO()
    const prev = editingId ? items.find((c) => c.id === editingId) : undefined
    const credit = Number(draft.credit)
    await saveItem({
      id: editingId ?? createId(),
      kind: draft.kind,
      group: draft.group.trim() || undefined,
      title: draft.title.trim(),
      // 空串 / 非法值一律不写学分 —— 留着 0 会污染"学过但没学分"的语义
      credit: Number.isFinite(credit) && credit > 0 ? credit : undefined,
      teacher: draft.teacher.trim() || undefined,
      status: draft.status,
      note: draft.note.trim() || undefined,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    })
    setDraft(null)
  }

  const addNote = async () => {
    const t = noteDraft.trim()
    if (!t) return
    await setNotes([...notes, t])
    setNoteDraft('')
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="tertiary" onClick={onBack} className="!px-2">
          <ChevronLeft size={14} /> 返回课表
        </Button>
        <Button size="sm" variant="tertiary" onClick={() => setGoalOpen(true)} className="!px-2">
          <Settings2 size={13} /> 目标学分
        </Button>
      </div>

      {/* ① 学分进度 —— 首屏就是这三行，一眼看到还差多少 */}
      <Section title="学分进度">
        <div className="space-y-2">
          {KIND_ORDER.map((kind) => {
            const p = progress.byKind[kind]
            return (
              <div key={kind} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="w-8 shrink-0 text-sm text-ink-muted">{KIND_LABEL[kind]}</span>
                <span className="tabular text-base font-medium text-ink">
                  {trim(p.selected)} / {trim(p.goal)}
                </span>
                <span className={cn('text-xs', p.reached ? 'text-teal' : 'text-ink-faint')}>
                  {p.goal === 0 ? '未设目标' : p.reached ? '已完成' : `还差 ${trim(p.remaining)} 学分`}
                </span>
                <RatioBar selected={p.selected} goal={p.goal} />
              </div>
            )
          })}
          <div className="flex items-baseline gap-3 border-t border-line pt-2">
            <span className="w-8 shrink-0 text-sm text-ink-muted">合计</span>
            <span className="tabular text-sm text-ink">
              {trim(progress.total.selected)} / {trim(progress.total.goal)}
            </span>
          </div>
        </div>
      </Section>

      {/* ② 三个方向的清单 */}
      {KIND_ORDER.map((kind) => {
        const list = ofKind(kind)
        return (
          <Section
            key={kind}
            title={KIND_LABEL[kind]}
            action={
              <Button size="sm" variant="tertiary" onClick={() => openNew(kind)}>
                <Plus size={13} /> 添加
              </Button>
            }
          >
            {kind === 'public' ? (
              <PublicList
                groups={publicGroups}
                ungrouped={list.filter((c) => !c.group?.trim())}
                onEdit={openEdit}
                onRemove={(c) => void removeItem(c.id)}
                onAddIn={(g) => openNew('public', g)}
              />
            ) : list.length === 0 ? (
              <p className="text-sm text-ink-faint">还没有条目。</p>
            ) : (
              <div>
                {list.map((c) => (
                  <PlanRow
                    key={c.id}
                    item={c}
                    onEdit={() => openEdit(c)}
                    onRemove={() => void removeItem(c.id)}
                  />
                ))}
              </div>
            )}
          </Section>
        )
      })}

      {/* ③ 候选 / 不可选：跨方向的汇总（你要的"简单列表"） */}
      {(
        [
          ['candidate', '候选课程'],
          ['unavailable', '不可选课程'],
        ] as const
      ).map(([status, title]) => {
        const list = byStatus(status)
        return (
          <Section key={status} title={title} hint={list.length > 0 ? `${list.length} 门` : undefined}>
            {list.length === 0 ? (
              <p className="text-sm text-ink-faint">暂无记录。</p>
            ) : (
              <div>
                {list.map((c) => (
                  <PlanRow
                    key={c.id}
                    item={c}
                    showKind
                    onEdit={() => openEdit(c)}
                    onRemove={() => void removeItem(c.id)}
                  />
                ))}
              </div>
            )}
          </Section>
        )
      })}

      {/* ④ 选课事项：自由文本，只记录、不审查（不做规则引擎） */}
      <Section title="选课事项">
        <div className="space-y-2">
          {notes.length === 0 && <p className="text-sm text-ink-faint">还没有事项。</p>}
          {notes.map((n, i) => (
            <div key={`${n}-${i}`} className="row">
              <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink">{n}</span>
              <button
                className="hover-reveal touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-cinnabar"
                onClick={() => void setNotes(notes.filter((_, j) => j !== i))}
                aria-label="删除这条事项"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addNote()
              }}
              placeholder="如：课程编码选择 24 开头"
              className="flex-1"
            />
            <Button size="sm" variant="secondary" onClick={() => void addNote()} disabled={!noteDraft.trim()}>
              添加
            </Button>
          </div>
        </div>
      </Section>

      <PlanDialog
        draft={draft}
        editing={editingId != null}
        onDraft={setDraft}
        onClose={() => setDraft(null)}
        onSave={() => void saveDraft()}
      />

      <Dialog open={goalOpen} onClose={() => setGoalOpen(false)} title="目标学分">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">填 0 表示暂时不设目标（只用来算「还差多少」）。</p>
          {KIND_ORDER.map((kind) => (
            <div key={kind} className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-sm text-ink-muted">{KIND_LABEL[kind]}</span>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={String(goals[kind])}
                onChange={(e) => void setGoal(kind, Number(e.target.value))}
                className="!w-24"
                aria-label={`${KIND_LABEL[kind]}目标学分`}
              />
              <span className="text-xs text-ink-faint">学分</span>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  )
}

/** 细比例条：进度一目了然；目标为 0 时不画（一条永远空的槽只是噪音） */
function RatioBar({ selected, goal }: { selected: number; goal: number }) {
  if (!(goal > 0)) return null
  const pct = Math.min(100, (selected / goal) * 100)
  return (
    <span className="flex h-1 w-20 shrink-0 overflow-hidden rounded-control bg-nested sm:w-28">
      <span className="bg-teal/70" style={{ width: `${pct}%` }} />
    </span>
  )
}
