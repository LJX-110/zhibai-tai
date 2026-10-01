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
import { seclusionReward } from '../../services/cultivation'
import { REALM_STEPS } from '../../services/merit'
import { useCultivation } from '../../hooks/useCultivation'
import { usePomodoroTimerStore } from '../../stores/usePomodoroTimerStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { playSound } from '../../services/sound'
import { Button, Input, Ring, Section, useToast } from '../../components/ui'
import { effectiveDone, liveFixedTasks } from '../../utils/id'
import { cn } from '../../utils/cn'

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
  const { result, merit, realm, progress, today, seclusionCount } = useCultivation()
  const tasks = useTaskStore((s) => s.items)
  const toast = useToast().toast

  // 闭关：复用番茄钟的 task 关联，不另造计时器
  const assoc = usePomodoroTimerStore((s) => s.assoc)
  const assocId = usePomodoroTimerStore((s) => s.assocId)
  const seconds = usePomodoroTimerStore((s) => s.seconds)
  const running = usePomodoroTimerStore((s) => s.running)
  const setMode = usePomodoroTimerStore((s) => s.setMode)
  const startTimer = usePomodoroTimerStore((s) => s.start)
  const resetTimer = usePomodoroTimerStore((s) => s.reset)
  /** 闭关内容改成**自由输入**（Step 5-3C）：不再只能从待办里认领 */
  const setAssocLabel = usePomodoroTimerStore((s) => s.setAssocLabel)
  const assocLabel = usePomodoroTimerStore((s) => s.assocLabel)

  /** 本地草稿：**入关那一刻**才写进 timer store —— 打字途中就写会让"正在闭关的内容"跟着改 */
  const [content, setContent] = useState('')
  // 判据含 `assocLabel`（已入关的自由输入内容）：自由输入的一次专注同样算闭关
  const inSeclusion = running && (assoc === 'task' || !!assocLabel)
  /** 待办候选：只作输入框的**建议**（datalist），不限定能写什么 */
  const candidates = useMemo(
    () => liveFixedTasks(tasks).filter((t) => !effectiveDone(t)).slice(0, 20),
    [tasks],
  )
  const liveTask = tasks.find((t) => t.id === assocId)
  /** 闭关中显示什么：自由输入优先，其次才回落到关联待办的标题 */
  const seclusionText = assocLabel || liveTask?.title || '未命名'

  const startSeclusion = () => {
    const text = content.trim()
    if (!text) return
    setAssocLabel(text)
    setMode('focus')
    startTimer()
    toast('已入关 · 专注完成即结算功行', 'success')
  }

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
        {/* 只留"限制"这一类信息（Microcopy 规范 §10：状态 / 代价 / 来源 / 限制） */}
        <p className="mt-2 hidden text-xs text-ink-faint md:block">
          每板块每日上限 8 功；观不记功。
        </p>
      </Section>

      {/* 闭关 —— 额外的境界提升方式 */}
      <Section title="闭关">
        {inSeclusion ? (
          <div className="flex items-center gap-3">
            <span className="tabular text-2xl font-semibold text-ink">{countdown(seconds)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">闭关中 · {seclusionText}</p>
              <p className="text-xs text-ink-faint">完成即结算 {seclusionReward(seconds / 60)} 功行</p>
            </div>
            <Button size="sm" variant="tertiary" onClick={resetTimer}>
              出关
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {/* 自由输入：闭关是"我要做成什么事"，不是从别人给的清单里挑一件。
                  待办标题只作 datalist 建议 —— 写"练两小时 Python"这种没有待办的事也可以。 */}
              <Input
                list="seclusion-candidates"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="本次闭关要完成的事"
                className="min-w-[12rem] flex-1"
                aria-label="闭关内容"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') startSeclusion()
                }}
              />
              <datalist id="seclusion-candidates">
                {candidates.map((t) => (
                  <option key={t.id} value={t.title} />
                ))}
              </datalist>
              <Button size="sm" variant="primary" disabled={!content.trim()} onClick={startSeclusion}>
                入关
              </Button>
            </div>
            <p className="mt-1.5 hidden text-xs text-ink-faint md:block">
              时长取番茄钟「专注」设置 · 结算 20 功 + 每 10 分钟 5 功行
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
                {/* 宽度用 scaleX 表达（只动 transform），不写 transition-all + width */}
                <div
                  className={cn(
                    'h-full w-full origin-left rounded-full transition-transform',
                    // 低分不用绛红：绛红在本体系里是「印章 / 危险」，拿它表示"分数低"会被误读成"出了问题"
                    d.value >= d.max * 0.75
                      ? 'bg-teal'
                      : d.value >= d.max * 0.4
                        ? 'bg-skill-qing'
                        : 'bg-ink-faint',
                  )}
                  style={{ transform: `scaleX(${d.value / d.max})` }}
                />
              </div>
              <span className="tabular w-10 shrink-0 text-right text-xs text-ink-muted">
                {d.value}/{d.max}
              </span>
            </div>
          ))}
        </div>
        {/* 「知常」那枚阶位小字已去掉（2026-09-29）：它只是五维快照的名字，
            放在这里既与「境界」争夺注意力、又对行动没有任何指示作用。
            五维的分数本身已经说明了今天怎么样。 */}
        <p className="mt-1.5 hidden text-xs text-ink-faint md:block">
          当天快照、不累积；<strong className="text-ink-muted">不参与境界判定</strong>。
        </p>
      </Section>
    </div>
  )
}
