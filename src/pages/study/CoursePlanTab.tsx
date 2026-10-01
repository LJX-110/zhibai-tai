/**
 * 学 · 学分 · 选课（2026-09-28 重做：从"多个小板块"变成"一页三层"）
 *
 * ## 页面只回答三个问题（规格 §A4）
 *  ① **我的选课目标是什么** —— 首屏三段紧凑摘要（限选 / 公选 / 体育：已完成 / 目标 / 差额）
 *  ② **我已经选了什么** —— 统一课程列表（方向 · 状态印章 · 课程名 · 学分 · 教师 · 备注）
 *  ③ **我还可以考虑什么** —— 同一张列表用轻量筛选切到「候选 / 不可选」
 *
 * ## 与上一版的区别（为什么重做）
 * 旧版按方向与状态摊成六个区块：同一门课在两处出现、状态是方块记号 + 文字标签，
 * 读起来像后台页面。现在**一行一课、只此一处**；状态收成一枚圆形异术印章（`STATUS_SEAL`），
 * 视觉等级明显低于课程标题；配置类操作（目标 / 新增 / 编辑）全部在 Dialog 里，不占版面。
 *
 * ## 数据口径（保持不变）
 * 全部来自 `CoursePlan`（条目）与 `CoursePlanMeta`（目标 / 事项）两张业务表，
 * 与 `Course`（正式课表）**互不依赖**；学分进度口径在 `services/study-plan.ts` 的 `planProgress`
 * （只数 `selected`、**超额不倒扣**、目标 0 = 未设目标）。
 * 公选分类（`group`）仍是自由文本，**只影响列表里的排序与行内显示**，不再是独立区块。
 */
import { useState } from 'react'
import { ChevronLeft, Plus, Settings2, Trash2 } from 'lucide-react'
import { useCoursePlanMetaStore, useCoursePlanStore } from '../../stores/useCoursePlanStore'
import { planProgress, publicGroupsOf } from '../../services/study-plan'
import type { CoursePlan, CoursePlanKind, CoursePlanStatus } from '../../types/entities'
import { Button, Chip, Collapse, Dialog, EmptyState, Input, ScrollRow, Section, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'
import { createId, nowISO } from '../../utils/id'
import { PlanDialog } from './CoursePlanDialog'
import { useInspectorStore } from '../../components/inspector/inspector-store'
import { PlanRow } from './CoursePlanRow'
import { KIND_LABEL, KIND_ORDER, STATUS_LABEL, emptyDraft, trim, type PlanDraft } from './plan-shared'

/** 状态筛选的展示顺序：全部 → 已选 → 候选 → 不可选（与"读一行课"的顺序一致） */
const STATUS_FILTERS: (CoursePlanStatus | 'all')[] = ['all', 'selected', 'candidate', 'unavailable']

export function CoursePlanTab({ onBack }: { onBack: () => void }) {
  const items = useCoursePlanStore((s) => s.items)
  const removeItem = useCoursePlanStore((s) => s.remove)
  const saveItem = useCoursePlanStore((s) => s.save)
  const { goals, notes, setGoal, setNotes } = useCoursePlanMetaStore()
  const toast = useToast().toast

  const progress = planProgress(items, goals)
  /** 公选分类的官方顺序 = 首次出现的顺序（`publicGroupsOf` 不排序，那是用户录入的顺序） */
  const groupOrder = new Map(publicGroupsOf(items).map((g, i) => [g.group, i]))

  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [filter, setFilter] = useState<CoursePlanStatus | 'all'>('all')

  /**
   * 统一列表的排序：方向（限选→公选→体育）→ 公选内按官方分类 → 状态（已选→候选→不可选）→ 课程名。
   * 同分类的课相邻，分类顺序仍是学校的顺序，不必再靠"分组区块"表达。
   */
  const statusRank: Record<CoursePlanStatus, number> = { selected: 0, candidate: 1, unavailable: 2 }
  const list = items
    .filter((c) => filter === 'all' || c.status === filter)
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (a.kind === 'public' ? (groupOrder.get(a.group ?? '') ?? 999) - (groupOrder.get(b.group ?? '') ?? 999) : 0) ||
        statusRank[a.status] - statusRank[b.status] ||
        a.title.localeCompare(b.title, 'zh-Hans-CN'),
    )

  const openNew = (kind: CoursePlanKind) => {
    setEditingId(null)
    setDraft(emptyDraft(kind))
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
      </div>

      {/* ① 选课目标 —— 首屏就这三行：已完成 / 目标 + 差额 + 细比例条 */}
      <Section
        title="选课目标"
        action={
          <Button size="sm" variant="tertiary" onClick={() => setGoalOpen(true)}>
            <Settings2 size={13} /> 目标学分
          </Button>
        }
      >
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

      {/* ② 课程计划 —— 一行一课；筛选是轻量的药丸行，不是分区 */}
      <Section
        title="课程计划"
        hint={items.length > 0 ? `${items.length} 门` : undefined}
        action={
          <Button size="sm" variant="primary" onClick={() => openNew('limited')}>
            <Plus size={13} /> 加一门
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState
            title="还没有课程"
            desc="把正在选 / 想选的课记进来，选完标成「已选」，学分进度会自己走"
            action={
              <Button variant="primary" onClick={() => openNew('limited')}>
                <Plus size={14} /> 加一门
              </Button>
            }
          />
        ) : (
          <>
            <ScrollRow className="mb-2" activeSelector={'[data-active="true"]'} activeKey={filter}>
              {STATUS_FILTERS.map((key) => (
                <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {key === 'all' ? '全部' : STATUS_LABEL[key]}
                </Chip>
              ))}
            </ScrollRow>
            {list.length > 0 ? (
              <div>
                {list.map((c) => (
                  <PlanRow
                    key={c.id}
                    item={c}
                    onDetail={() => useInspectorStore.getState().open('coursePlan', c.id)}
                    onEdit={() => openEdit(c)}
                    onRemove={() => void removeItem(c.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="py-2 text-xs text-ink-faint">没有该状态的课程</p>
            )}
          </>
        )}
      </Section>

      {/* ③ 选课事项 —— 低频，折叠；内容不减（自由文本，不做规则引擎） */}
      <Collapse title="选课事项" hint={notes.length > 0 ? `${notes.length} 条` : '随时记'}>
        <div className="space-y-2">
          {notes.map((n, i) => (
            <div key={`${n}-${i}`} className="row group">
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
      </Collapse>

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
      {/* 用 scaleX 而不是 width（动画只动 transform / opacity 的硬规则） */}
      <span
        className="h-full w-full origin-left bg-teal/70"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </span>
  )
}