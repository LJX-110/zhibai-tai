/**
 * 修 · 成长页签 —— 修行境界（累积）+ 今日道行（快照）+ 闭关 + 五维
 *
 * 改造要点（2026-09-21）：境界从「今日总分定阶」改为「**累计修为定阶、只升不降**」。
 * 两个口径刻意同屏并存、各说各的：
 *  · **修行境界** = 逐日累加的修为定阶，是"我修到什么份上"，忙几天不记录也不会掉；
 *  · **今日道行** = 当天功夫的快照，不记录就回落 —— 这是对的，它本来就是"今天的"。
 * 把它们混成一个数，就会出现"今天没记录，境界白修了"这种最打击人的体验。
 *
 * 闭关（专门的提升方式）= 认领一件今日实事的专注（复用番茄钟的 task 关联），
 * 完成才结算修为。计时不另造 —— 番茄钟本就是全局唯一的专注计时。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cultivationGrade,
  readBest,
  saveBestIfHigher,
  seclusionReward,
  type BestRecord,
  type CultivationGrade,
} from '../../services/cultivation'
import { useCultivation } from '../../hooks/useCultivation'
import { usePomodoroTimerStore } from '../../stores/usePomodoroTimerStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { playSound } from '../../services/sound'
import { Button, Ring, Section, Select, useToast } from '../../components/ui'
import { todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'

/** 倒计时 mm:ss（闭关中的剩余时长） */
function countdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 五阶视觉谱系 —— 色全部取自既有 tokens，用类名而非 inline style（便于 React Compiler 优化） */
const GRADE_CLASS: Record<CultivationGrade['tone'], string> = {
  plain: 'border-ink-muted text-ink-muted',
  qing: 'border-skill-qing text-skill-qing',
  teal: 'border-teal text-teal',
  bronze: 'border-bronze text-bronze',
  cinnabar: 'border-cinnabar text-cinnabar',
}

export function GrowthTab() {
  const { result, grade, cumulative, realm, progress, seclusionCount } = useCultivation()
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
  /** 可认领的实事：未完成的待办（含今日到期），最多取 20 条免得下拉过长 */
  const candidates = useMemo(
    () => tasks.filter((t) => !t.done).slice(0, 20),
    [tasks],
  )
  const liveTask = tasks.find((t) => t.id === assocId)

  // 今日道行的历史峰值 —— 仍存本机。它记的是「单日道行最高到过多少」，
  // 与「累积修为」不是一个量纲，所以**刻意不做折算迁移**：
  // 拿旧峰值去推累计修为等于凭空造数据（一次日峰值怎能等于 8100 修为）。
  // 境界从零起算、从今天开始累；旧的峰值照原样展示在今日道行卡里，什么都没丢。
  const [best, setBest] = useState<BestRecord | null>(() => readBest())
  useEffect(() => {
    // 只在 total 变化时评估，并在 effect 内派生 grade ——
    // 直接依赖 grade 对象会每次渲染都触发（它每次都是新对象），白跑一遍还掩盖真实触发源
    if (saveBestIfHigher(cultivationGrade(result.total), result.total)) setBest(readBest())
  }, [result.total])

  // 进境反馈：修行境界升阶最值得庆祝（那是持续累积的成果）；今日道行升阶次之。
  // 同一次变化里两者都动时只响一次 —— 否则会连响两声、弹两条提示。
  const prevRealmRef = useRef<string | null>(null)
  const prevGradeRef = useRef<string | null>(null)
  useEffect(() => {
    const realmUp = prevRealmRef.current !== null && prevRealmRef.current !== realm.title
    const gradeUp = prevGradeRef.current !== null && prevGradeRef.current !== grade.title
    if (realmUp) {
      playSound('levelup')
      toast(`境界提升 · ${realm.title}`, 'success')
    } else if (gradeUp) {
      playSound('levelup')
      toast(`今日道行有进 · ${grade.title}`, 'success')
    }
    prevRealmRef.current = realm.title
    prevGradeRef.current = grade.title
  }, [realm.title, grade.title, toast])

  return (
    <div className="space-y-3">
      {/* 修行境界 —— 累积口径，本页主角 */}
      <Section title="修行境界">
        <div className="flex items-center gap-5">
          <Ring percent={progress.percent * 100} size={112} stroke={9}>
            <span className="tabular text-xl font-semibold text-ink">{cumulative}</span>
            {/* 字号例外：112px 环内只放得下 10px 的「修为」二字 */}
            <span className="text-[10px] text-ink-faint">修为</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'inline-flex items-center rounded-tile border px-2.5 py-1 text-sm font-medium',
                GRADE_CLASS[realm.tone],
              )}
            >
              {realm.title}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{realm.desc}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {progress.next === null
                ? `已至顶阶 · 闭关 ${seclusionCount} 次`
                : `距 ${progress.nextTitle} 还差 ${progress.remaining} · 闭关 ${seclusionCount} 次`}
            </p>
          </div>
        </div>
      </Section>

      {/* 今日道行 —— 快照口径。刻意与境界分开写，免得"今天没记录=境界白修"被误读 */}
      <Section title="今日道行">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-nested">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                // 今日道行到哪一阶，进度条就是哪一阶的色（与阶位铭牌同一色系）
                grade.rank >= 4
                  ? 'bg-cinnabar'
                  : grade.rank >= 3
                    ? 'bg-bronze'
                    : grade.rank >= 2
                      ? 'bg-teal'
                      : grade.rank >= 1
                        ? 'bg-skill-qing'
                        : 'bg-ink-faint',
              )}
              style={{ width: `${result.total}%` }}
            />
          </div>
          <span className="tabular w-16 shrink-0 text-right text-sm text-ink-muted">
            {result.total}/100
          </span>
          <span className={cn('shrink-0 rounded-control border px-2 py-0.5 text-xs', GRADE_CLASS[grade.tone])}>
            {grade.title}
          </span>
        </div>
        {/* 说明性小字只在桌面显示（项目移动端约定第 4 条）；历史最高带实时数据，移动端也留 */}
        <p className="mt-1.5 text-xs text-ink-faint">
          <span className="hidden md:inline">今日的心境快照，明天重新计；修行境界只累加、不回落 ·{' '}</span>
          历史最高 {best ? `${best.title}（${best.total}）` : '暂无记录'}
        </p>
      </Section>

      {/* 闭关 —— 专门的境界提升方式 */}
      <Section title="闭关">
        {inSeclusion ? (
          <div className="flex items-center gap-3">
            <span className="tabular text-2xl font-semibold text-ink">{countdown(seconds)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">闭关中 · {liveTask?.title ?? '未命名'}</p>
              <p className="text-xs text-ink-faint">完成即结算 {seclusionReward(seconds / 60)} 点修为</p>
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
                  toast('已入关，专注完成即结算修为', 'success')
                }}
              >
                入关
              </Button>
            </div>
            {/* 纯说明，移动端不占首屏 */}
            <p className="mt-1.5 hidden text-xs text-ink-faint md:block">
              时长取番茄钟的专注设置；完成后额外得 20 + 每 10 分钟 5 点修为 —— 这是提升境界最快的路。
            </p>
          </>
        )}
      </Section>

      {/* 五维分解：行 / 学 / 身 / 心 / 创 */}
      <Section title="五维">
        <div className="space-y-2.5">
          {result.dimensions.map((d) => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="display w-6 shrink-0 text-sm font-semibold text-ink">{d.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-nested">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    // 低分不再用绛红：绛红在本体系里是「印章 / 危险」，
                    // 拿它表示"分数低"会被误读成"出了问题"
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
      </Section>
    </div>
  )
}
