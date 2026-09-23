/**
 * 修 · 成长页签 —— 功行与境界（累计）+ 今日净行 + 闭关 + 今日炁象
 *
 * ## 2026-09-22 重做（这一版为什么长这样）
 *
 * 三处硬伤被一并解决：
 *  1. **判据单一**：境界只由**累计功行**定阶（`services/merit.ts`），
 *     不再拿"今日某某"当判据 —— 那种口径今天不记录就掉阶，等于每天清零重来。
 *  2. **过慢且无反馈**：阶次改为「六境 + **抱朴六轮**」，前六阶每 15 功一进 →
 *     头几天就能连过数轮，早期有连续的小进阶感；配进度条 + 差额 + 升阶音效。
 *  3. **只覆盖 5 个板块**：改为**九板块净行**（数据源是既有动作流水），
 *     财/藏/情/奇/术/天机的行为终于算数了；每板块每日上限 8 功防刷。
 *
 * 「今日炁象」（五维）**保留但降级**：它只是首页罗盘的视觉输入，不参与境界判定。
 * 刻意不在同一张卡里并排两个"等级感"的东西 —— 那正是上一版让人困惑的原因。
 *
 * 闭关 = 认领一件实事的专注（复用番茄钟），完成才结算额外功行。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { seclusionReward, type CultivationGrade } from '../../services/cultivation'
import { REALM_STEPS } from '../../services/merit'
import { useCultivation } from '../../hooks/useCultivation'
import { usePomodoroTimerStore } from '../../stores/usePomodoroTimerStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { playSound } from '../../services/sound'
import { Button, Ring, Section, Select, useToast } from '../../components/ui'
import { effectiveDone, liveFixedTasks, todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'

/** 今日炁象的阶位取色（罗盘用，与境界无关） */
const GRADE_CLASS: Record<CultivationGrade['tone'], string> = {
  plain: 'border-ink-muted text-ink-muted',
  qing: 'border-skill-qing text-skill-qing',
  teal: 'border-teal text-teal',
  bronze: 'border-bronze text-bronze',
  cinnabar: 'border-cinnabar text-cinnabar',
}

/**
 * 境界铭牌取色：按阶次递进（越上越重）。
 * 抱朴六轮（rank 0-5）同为最浅档 —— 它们只是同一境里的轮次，不该显得像六个大境界。
 */
const REALM_TONE = [
  'border-ink-muted text-ink-muted',
  'border-skill-qing text-skill-qing',
  'border-teal text-teal',
  'border-bronze text-bronze',
  'border-cinnabar text-cinnabar',
]
function realmToneClass(rank: number): string {
  if (rank <= 5) return REALM_TONE[0]
  return REALM_TONE[Math.min(rank - 5, REALM_TONE.length - 1)]
}

/** 倒计时 mm:ss（闭关中的剩余时长） */
function countdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function GrowthTab() {
  const { result, grade, merit, realm, progress, today, seclusionCount } = useCultivation()
  const tasks = useTaskStore((s) => s.items)
  const toast = useToast().toast

  // 闭关：复用番茄钟的 task 关联，不另造计时器
  const assoc = usePomodoroTimerStore((s) => s.assoc)
  const assocId = usePomodoroTimerStore((s) => s.assocId)
  const seconds = usePomodoroTimerStore((s) => s.seconds)
  const running = usePomodoroTimerStore((s) => s.running)
  const setAssoc = usePomodoroTimerStore((s) => s.setAssoc)
  const setMode = usePomodoroTimerStore((s) => s.setMode)
  const startTimer = usePomodoroTimerStore((s) => s.start)
  const resetTimer = usePomodoroTimerStore((s) => s.reset)

  const [pickId, setPickId] = useState('')
  const inSeclusion = running && assoc === 'task'
  /** 可认领的实事：本期未完成的待办（含今日到期），最多取 20 条免得下拉过长。
   *  先取在世记录再按「本期」判完成 —— 否则昨天做完的每日固定今天认领不了，
   *  已隐藏的历史副本也会混进下拉。 */
  const candidates = useMemo(
    () => liveFixedTasks(tasks).filter((t) => !effectiveDone(t)).slice(0, 20),
    [tasks],
  )
  const liveTask = tasks.find((t) => t.id === assocId)

  // 升阶反馈：境界升阶是最值得庆祝的（持续累积的成果）
  const prevRealmRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevRealmRef.current !== null && prevRealmRef.current !== realm.title) {
      playSound('levelup')
      toast(`境界提升 · ${realm.title}`, 'success')
    }
    prevRealmRef.current = realm.title
  }, [realm.title, toast])

  const activeSections = today.sections.filter((s) => s.merit > 0)

  return (
    <div className="space-y-3">
      {/* 修行境界 —— 全站唯一的"等级"，由累计功行定阶 */}
      <Section title="修行境界">
        <div className="flex items-center gap-5">
          <Ring percent={progress.percent * 100} size={112} stroke={9}>
            <span className="tabular text-xl font-semibold text-ink">{merit}</span>
            {/* 字号例外：112px 环内只放得下 10px 的「功行」二字 */}
            <span className="text-[10px] text-ink-faint">功行</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'inline-flex flex-wrap items-baseline gap-1.5 rounded-tile border px-2.5 py-1',
                realmToneClass(realm.rank),
              )}
            >
              <span className="text-sm font-medium">{realm.title}</span>
              {realm.honorific && (
                <span className="text-xs opacity-80">尊称 · {realm.honorific}</span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{realm.desc}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {progress.next === null
                ? `已至 ${REALM_STEPS[REALM_STEPS.length - 1].realm} · 闭关 ${seclusionCount} 次`
                : `距 ${progress.nextTitle} 还差 ${progress.remaining} · 闭关 ${seclusionCount} 次`}
            </p>
          </div>
        </div>
      </Section>

      {/* 今日净行 —— 让"今天修了什么"可见，这是"缺乏反馈"的正解 */}
      <Section title="今日净行">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="tabular text-lg font-semibold text-cinnabar">+{today.total}</span>
          <span className="text-xs text-ink-muted">
            功行
            {activeSections.length > 0 &&
              ` · 已修 ${activeSections.map((s) => s.label).join('')}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {today.sections.map((s) => (
            <span
              key={s.key}
              title={`${s.count} 次动作 · 每日上限 ${s.dailyCap} 功`}
              className={cn(
                'inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-xs',
                s.merit > 0
                  ? 'border-teal/35 bg-teal/10 text-teal'
                  : 'border-line bg-raised text-ink-faint',
              )}
            >
              <span className="display font-medium">{s.label}</span>
              <span className="tabular opacity-80">{s.merit > 0 ? `+${s.merit}` : '—'}</span>
            </span>
          ))}
        </div>
        {/* 纯说明，移动端不占首屏 */}
        <p className="mt-2 hidden text-xs text-ink-faint md:block">
          九板块里任何一件有意义的动作都会记功行；每板块每日上限 8 功，避免重复刷分。
          观是汇总视图，不单独记功。
        </p>
      </Section>

      {/* 闭关 —— 额外的境界提升方式 */}
      <Section title="闭关">
        {inSeclusion ? (
          <div className="flex items-center gap-3">
            <span className="tabular text-2xl font-semibold text-ink">{countdown(seconds)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">闭关中 · {liveTask?.title ?? '未命名'}</p>
              <p className="text-xs text-ink-faint">完成即结算 {seclusionReward(seconds / 60)} 功行</p>
            </div>
            <Button size="sm" variant="tertiary" onClick={resetTimer}>
              出关
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={pickId}
                onChange={(e) => setPickId(e.target.value)}
                className="!w-auto !py-1.5 text-sm"
                aria-label="认领实事"
              >
                <option value="">认领一件今日实事…</option>
                {candidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.dueDate === todayISO() ? '今日 · ' : ''}
                    {t.title}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="primary"
                disabled={!pickId}
                onClick={() => {
                  setMode('focus')
                  setAssoc('task', pickId)
                  startTimer()
                  toast('已入关，专注完成即结算功行', 'success')
                }}
              >
                入关
              </Button>
            </div>
            <p className="mt-1.5 hidden text-xs text-ink-faint md:block">
              时长取番茄钟的专注设置；完成后额外得 20 + 每 10 分钟 5 功行 —— 这是提升境界最快的路。
            </p>
          </>
        )}
      </Section>

      {/* 今日炁象（五维）—— 明确标注它只是罗盘输入，不是境界 */}
      <Section title="今日炁象">
        <div className="space-y-2.5">
          {result.dimensions.map((d) => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="display w-6 shrink-0 text-sm font-semibold text-ink">{d.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-nested">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    // 低分不用绛红：绛红在本体系里是「印章 / 危险」，拿它表示"分数低"会被误读成"出了问题"
                    d.value >= d.max * 0.75
                      ? 'bg-teal'
                      : d.value >= d.max * 0.4
                        ? 'bg-skill-qing'
                        : 'bg-ink-faint',
                  )}
                  style={{ width: `${(d.value / d.max) * 100}%` }}
                />
              </div>
              <span className="tabular w-10 shrink-0 text-right text-xs text-ink-muted">
                {d.value}/{d.max}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">
          <span className={cn('mr-1 rounded-control border px-1.5 py-0.5', GRADE_CLASS[grade.tone])}>
            {grade.title}
          </span>
          <span className="hidden md:inline">
            今日的五维快照，明天重新计、不累积；它是首页罗盘的视觉输入，
            <strong className="text-ink-muted">不参与境界判定</strong>。
          </span>
        </p>
      </Section>
    </div>
  )
}
