/**
 * 学 · 学分 · 选课（2026-09-28 重做；2026-10-02 分类 / 搜索 / 排序改版）
 *
 * ## 页面回答的问题
 *  ① **我的选课目标是什么** —— 首屏三段紧凑摘要（限选 / 公选 / 体育：已完成 / 目标 / 差额）
 *  ② **我已经选了什么 / 还想选什么** —— 统一课程列表，可按**一级分类（方向）**、
 *     状态、关键词（含标签）筛选找课
 *  ③ **我还差多少、下一步选什么** —— 目标差额 + 「AI 建议」（把进度预填给天机）
 *
 * ## 2026-10-02 改版（用户："分类应该是限选/公选/体育，现在不方便找"）
 *  · **一级分类筛选行**：全部 / 限选 n / 公选 n / 体育 n（带计数）；
 *  · **搜索框**：课名 / 教师 / 二级分类 / 标签 / 备注，跨方向找课；
 *  · **标签**：行内小字可点 → 填入搜索；二级分类对全部方向可用（数据仍是自由文本）；
 *  · **手动排序**：Section 头部「排序」进入排序模式（清掉状态筛选与搜索 —— 被筛掉的
 *    邻居会让 ↑↓ 看起来乱跳），行右侧换成 ↑↓，只在**同方向内**换位；
 *  · 排序口径与纯函数都在 `services/study-plan.ts`（comparePlanItems / movePlanItem）。
 *
 * ## 数据口径（保持不变）
 * 全部来自 `CoursePlan`（条目）与 `CoursePlanMeta`（目标 / 事项）两张业务表，
 * 与 `Course`（正式课表）**互不依赖**；学分进度口径在 `services/study-plan.ts` 的 `planProgress`
 * （只数 `selected`、**超额不倒扣**、目标 0 = 未设目标）。
 */
import { useState } from 'react'
import { ArrowUpDown, ChevronLeft, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react'
import { useCoursePlanMetaStore, useCoursePlanStore } from '../../stores/useCoursePlanStore'
import {
  comparePlanItems,
  groupSuggestions,
  matchesQuery,
  movePlanItem,
  normalizeTags,
  planProgress,
  publicGroupsOf,
} from '../../services/study-plan'
import type { CoursePlan, CoursePlanKind, CoursePlanStatus } from '../../types/entities'
import { Button, Chip, Collapse, Dialog, EmptyState, Input, ScrollRow, Section, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'
import { createId, nowISO } from '../../utils/id'
import { useAIChatStore } from '../../components/ai/chat-store'
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
  const saveMany = useCoursePlanStore((s) => s.saveMany)
  const { goals, notes, setGoal, setNotes } = useCoursePlanMetaStore()
  const toast = useToast().toast

  const progress = planProgress(items, goals)
  /** 公选分类的官方顺序 = 首次出现的顺序（`publicGroupsOf` 不排序，那是用户录入的顺序） */
  const groupOrder = new Map(publicGroupsOf(items).map((g, i) => [g.group, i]))
  /** 列表排序口径（与 `movePlanItem` 共用同一个上下文，避免"看到的顺序"和"换位的顺序"不一致） */
  const sortCtx = { kindOrder: KIND_ORDER, groupOrder }
  /** 一级分类的计数（筛选药丸上直接给数，先看规模再点进去） */
  const counts: Record<CoursePlanKind, number> = { limited: 0, public: 0, pe: 0 }
  for (const c of items) counts[c.kind] += 1

  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [filter, setFilter] = useState<CoursePlanStatus | 'all'>('all')
  const [kindFilter, setKindFilter] = useState<CoursePlanKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState(false)

  /** 当前可见列表：一级分类 → 状态 → 关键词，最后按统一排序口径排（派生数据在组件体内算，勿进 selector） */
  const list = items
    .filter((c) => kindFilter === 'all' || c.kind === kindFilter)
    .filter((c) => filter === 'all' || c.status === filter)
    .filter((c) => matchesQuery(c, query))
    .sort((a, b) => comparePlanItems(a, b, sortCtx))

  /** 排序模式下的 ↑↓ 边界：同方向内是否还有上一条 / 下一条（按当前可见列表算） */
  const moveBounds = new Map<string, { up: boolean; down: boolean }>()
  if (sortMode) {
    for (const kind of KIND_ORDER) {
      const arr = list.filter((c) => c.kind === kind)
      arr.forEach((c, i) => moveBounds.set(c.id, { up: i > 0, down: i < arr.length - 1 }))
    }
  }

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
      tags: (c.tags ?? []).join(' '),
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
    const tags = normalizeTags(draft.tags)
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
      tags: tags.length > 0 ? tags : undefined,
      // 手动顺序只在"同一方向"内有意义：改了方向就丢弃（旧序号会和新方向里的序号打架）
      order: prev && prev.kind === draft.kind ? prev.order : undefined,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    })
    setDraft(null)
  }

  /** 进入 / 退出排序模式：进入时清掉状态筛选与搜索（见文件头） */
  const toggleSort = () => {
    if (sortMode) {
      setSortMode(false)
      return
    }
    setFilter('all')
    setQuery('')
    setSortMode(true)
  }

  /** 手动换位：只保存真正变了 order 的行（物化会让同方向其它行也带上 order，但值相同的不用写库） */
  const move = async (id: string, dir: -1 | 1) => {
    const next = movePlanItem(items, id, dir, sortCtx)
    const before = new Map(items.map((c) => [c.id, c.order]))
    const changed = next.filter((c) => before.get(c.id) !== c.order)
    if (changed.length === 0) return
    await saveMany(changed.map((c) => ({ ...c, updatedAt: nowISO() })))
  }

  /** 「AI 建议」：把当前进度预填给天机（**不自动发送** —— 发送权在用户手里） */
  const askAi = () => {
    const line = KIND_ORDER.map((k) => {
      const p = progress.byKind[k]
      return `${KIND_LABEL[k]} 已选 ${trim(p.selected)}/${trim(p.goal)}${
        p.goal > 0 ? `（还差 ${trim(p.remaining)}）` : '（未设目标）'
      }`
    }).join('；')
    const candidates = items.filter((c) => c.status === 'candidate').length
    useAIChatStore.getState().openWithDraft(
      `结合我的选课规划给点建议：${line}。候选课有 ${candidates} 门。优先补哪些缺口、哪些课值得优先考虑？`,
    )
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

      {/* ② 课程计划 —— 一行一课；筛选是"一级分类 + 状态"两行轻量药丸 + 一个搜索框 */}
      <Section
        title="课程计划"
        hint={items.length > 0 ? `${items.length} 门` : undefined}
        action={
          items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="tertiary" onClick={toggleSort} className="!px-2">
                <ArrowUpDown size={13} /> {sortMode ? '完成' : '排序'}
              </Button>
              <Button size="sm" variant="tertiary" onClick={askAi} className="!px-2">
                <Sparkles size={13} /> AI 建议
              </Button>
              <Button size="sm" variant="primary" onClick={() => openNew('limited')}>
                <Plus size={13} /> 加一门
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={() => openNew('limited')}>
              <Plus size={13} /> 加一门
            </Button>
          )
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
            {/* 搜索：跨方向找课（课名 / 教师 / 二级分类 / 标签 / 备注） */}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜课程 / 教师 / 二级分类 / 标签"
              className="mb-2"
              aria-label="搜索课程"
            />
            {/* 一级分类：限选 / 公选 / 体育（带计数）——"不方便找"的正解 */}
            <ScrollRow className="mb-2" activeSelector={'[data-active="true"]'} activeKey={kindFilter}>
              <Chip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
                全部 <span className="tabular opacity-60">{items.length}</span>
              </Chip>
              {KIND_ORDER.map((k) => (
                <Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
                  {KIND_LABEL[k]} <span className="tabular opacity-60">{counts[k]}</span>
                </Chip>
              ))}
            </ScrollRow>
            <ScrollRow className="mb-2" activeSelector={'[data-active="true"]'} activeKey={filter}>
              {STATUS_FILTERS.map((key) => (
                <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {key === 'all' ? '全部' : STATUS_LABEL[key]}
                </Chip>
              ))}
            </ScrollRow>
            {sortMode && (
              <p className="mb-2 text-xs leading-relaxed text-ink-faint">
                点 ↑↓ 在**方向内**调整顺序；跨方向的先后由方向本身决定。
              </p>
            )}
            {list.length > 0 ? (
              <div>
                {list.map((c) => {
                  const bounds = moveBounds.get(c.id)
                  return (
                    <PlanRow
                      key={c.id}
                      item={c}
                      sortMode={sortMode}
                      canUp={bounds?.up ?? false}
                      canDown={bounds?.down ?? false}
                      onMove={(dir) => void move(c.id, dir)}
                      onTag={setQuery}
                      onDetail={() => useInspectorStore.getState().open('coursePlan', c.id)}
                      onEdit={() => openEdit(c)}
                      onRemove={() => void removeItem(c.id)}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="py-2 text-xs text-ink-faint">没有符合条件的课程</p>
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
        groupOptions={groupSuggestions(items, draft?.kind ?? 'limited')}
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