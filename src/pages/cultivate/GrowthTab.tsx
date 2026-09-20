/**
 * 修 · 成长页签（今日五维 · 轻量化）
 * 只留「今日五维道行 + 等级」单屏信息：历史曲线/月份明细这类沉重建图下沉到「观」首页。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTodayStats } from '../../hooks/useTodayStats'
import {
  computeCultivation,
  cultivationGrade,
  readBest,
  saveBestIfHigher,
  type BestRecord,
  type CultivationGrade,
} from '../../services/cultivation'
import { playSound } from '../../services/sound'
import { Ring, Section, useToast } from '../../components/ui'
import { cn } from '../../utils/cn'

/** 五阶视觉谱系 —— 色全部取自既有 tokens，用类名而非 inline style（便于 React Compiler 优化） */
const GRADE_CLASS: Record<CultivationGrade['tone'], string> = {
  plain: 'border-ink-muted text-ink-muted',
  qing: 'border-skill-qing text-skill-qing',
  teal: 'border-teal text-teal',
  bronze: 'border-bronze text-bronze',
  cinnabar: 'border-cinnabar text-cinnabar',
}

export function GrowthTab() {
  const stats = useTodayStats()
  const cultivation = useMemo(
    () =>
      computeCultivation({
        tasksDoneToday: stats.tasksDone,
        focusMinutesToday: stats.focusMinutes,
        waterRatio: stats.waterRatio,
        habitLogsToday: stats.habitLogs,
        bodyLogsToday: stats.bodyLogs,
        notesToday: stats.notesToday,
        creationsToday: stats.creations,
      }),
    [stats],
  )
  const grade = cultivationGrade(cultivation.total)
  const toast = useToast().toast
  // 历史最高：道行由本机今日数据算出，纪录也存本机（跨设备同步会与「今日」语义冲突）
  const [best, setBest] = useState<BestRecord | null>(() => readBest())
  useEffect(() => {
    // 历史最高只随「今日道行」评估：grade 由 total 派生，真实触发量只有 total。
    // 在 effect 内用 total 派生 grade（而非依赖整个 grade 对象），消除「依赖写 grade.rank 却用 grade」的不一致；
    // 且仅在真的刷新纪录时才 setState，避免每次道行变化都无意义重渲染
    const g = cultivationGrade(cultivation.total)
    if (saveBestIfHigher(g, cultivation.total)) {
      setBest(readBest())
    }
  }, [cultivation.total])

  // 进境反馈：缓存上次等级，首次进入不播，真的升阶才响 + 一行道贺
  const prevGradeRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevGradeRef.current && prevGradeRef.current !== grade.title && grade.title !== '初窥门径') {
      playSound('levelup')
      toast(`道行有进 · ${grade.title}`, 'success')
    }
    prevGradeRef.current = grade.title
  }, [grade.title, toast])

  return (
    <div className="space-y-3">
      {/* 境界卡：分数环 + 阶位铭牌（色即该阶的色）+ 历史最高。
          这里刻意不给 Section 传 hint={grade.title}：正下方的阶位铭牌就是同一个
          字符串、还带阶位色，标题行再写一遍等于同一句话说两遍（用户反馈的「重复小字」）。 */}
      <Section title="今日道行">
        <div className="flex items-center gap-5">
          <Ring percent={cultivation.total} size={112} stroke={9}>
            <span className="tabular text-xl font-semibold text-ink">{cultivation.total}</span>
            {/* 字号例外：同上行，112px 环内只放得下 10px 的「/ 100」 */}
            <span className="text-[10px] text-ink-faint">/ 100</span>
          </Ring>
          <div className="min-w-0 flex-1">
            {/* 阶位铭牌：五阶各有其色，一眼看出「在哪一层」 */}
            <div
              className={cn(
                'inline-flex items-center rounded-tile border px-2.5 py-1 text-sm font-medium',
                GRADE_CLASS[grade.tone],
              )}
            >
              {grade.title}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{grade.desc}</p>
            <p className="mt-1 text-xs text-ink-faint">
              历史最高 · {best ? `${best.title}（${best.total}）` : '暂无记录'}
            </p>
          </div>
        </div>
      </Section>

      {/* 五维分解：行 / 学 / 身 / 心 / 创 */}
      <Section title="五维">
        <div className="space-y-2.5">
          {cultivation.dimensions.map((d) => (
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
