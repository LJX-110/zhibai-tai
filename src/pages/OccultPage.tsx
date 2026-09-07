/**
 * 奇 —— 梅花易数 + 每日签 + 历史 + 常用工具
 */
import { useState } from 'react'
import { History, ScrollText, Sparkles, Wand2 } from 'lucide-react'
import { useDivinationStore, saveDailySignRecord } from '../stores/useDivinationStore'
import { BAGUA, signOf } from '../services/divination'
import { castMeihua, MEIHUA_METHOD_LABEL, type MeihuaCast, type MeihuaMethod } from '../services/occult/meihua'
import { initDayan, stepDayan, yaoTitle, type DayanState } from '../services/occult/dayan'
import { aiService } from '../services/ai/ai-service'
import { useTodayStats } from '../hooks/useTodayStats'
import { recordActivity } from '../services/activity'
import { useInspectorStore } from '../components/inspector/Inspector'
import { Taiji } from '../components/ui/Taiji'
import { Seal } from '../components/ui/Seal'
import { playSound } from '../services/sound'
import type { DivinationRecord } from '../types/entities'
import { createId, todayISO } from '../utils/id'
import { cn } from '../utils/cn'
import { Badge, Button, Dialog, EmptyState, Input, Section, useToast } from '../components/ui'

export function OccultPage() {
  const today = todayISO()
  const sign = signOf(today)
  const toast = useToast().toast
  const records = useDivinationStore((s) => s.items)
  const stats = useTodayStats()

  const [explain, setExplain] = useState<{ title: string; body: string } | null>(null)
  const [explaining, setExplaining] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  /** AI 白话解读（梅花） */
  const [mhMethod, setMhMethod] = useState<MeihuaMethod>('numbers')
  const [mhN1, setMhN1] = useState('')
  const [mhN2, setMhN2] = useState('')
  const [mhWords, setMhWords] = useState('')
  const [mh, setMh] = useState<MeihuaCast | null>(null)

  const castMh = () => {
    try {
      const c = castMeihua(mhMethod, { n1: Number(mhN1), n2: Number(mhN2), words: mhWords })
      setMh(c)
      setExplain(null)
      playSound('compass')
      toast(`梅花起卦：${c.benGua.name} · ${c.verdict}`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '起卦失败', 'danger')
    }
  }

  const explainMh = async () => {
    if (!mh) return
    setExplaining('meihua')
    playSound('ui-open')
    try {
      const data = `本卦 ${mh.benGua.name}（${mh.benGua.xiang}），卦辞：${mh.benGua.guoci}；互卦 ${mh.huGua.name}；变卦 ${mh.bianGua.name}；动爻第 ${mh.dongYao} 爻；体${mh.ti.trigram.name}（${mh.ti.element}）、用${mh.yong.trigram.name}（${mh.yong.element}），${mh.relation}。规则断曰：${mh.verdict}`
      const body = await aiService.occultExplain('meihua', data)
      setExplain({ title: 'AI 解卦', body })
    } catch {
      toast('AI 解释失败', 'danger')
    } finally {
      setExplaining(null)
    }
  }

  const saveMh = async () => {
    if (!mh) return
    const record: DivinationRecord = {
      id: createId(),
      type: 'bagua',
      date: today,
      title: `梅花易数 · ${mh.benGua.name}（${mh.verdict}）`,
      input: `${MEIHUA_METHOD_LABEL[mh.method]} · ${mh.seed}`,
      result: `本卦 ${mh.benGua.name}（${mh.benGua.xiang}）· 互卦 ${mh.huGua.name} · 变卦 ${mh.bianGua.name}；动爻第 ${mh.dongYao} 爻；体${mh.ti.trigram.name}(${mh.ti.element}) 用${mh.yong.trigram.name}(${mh.yong.element})`,
      interpretation: `${mh.relation}。断曰：${mh.verdict}。${mh.summary}\n本卦辞：${mh.benGua.guoci}`,
      tags: ['梅花易数', mh.verdict],
      createdAt: new Date().toISOString(),
    }
    await useDivinationStore.getState().add(record)
    void recordActivity({ entityType: 'divination', entityId: record.id, title: `梅花易数 · ${mh.benGua.name}` })
    toast('卦已入档', 'success')
  }

  /** 记今日签 */
  const saveDailySign = async () => {
    const { sign: s, saved } = await saveDailySignRecord(today)
    if (!saved) {
      toast('今日签已记')
      return
    }
    const savedRecord = useDivinationStore
      .getState()
      .items.find((r) => r.type === 'daily_sign' && r.date === today)
    void recordActivity({
      entityType: 'divination',
      entityId: savedRecord?.id ?? '',
      title: `每日签 · ${s.title}`,
    })
    toast('今日签已入档', 'success')
  }

  /** AI 个性化解读：结合今日真实数据，生成后缓存进签记录 */
  const todaySignRecord = records.find((r) => r.type === 'daily_sign' && r.date === today)
  const genSignReading = async () => {
    setReading(true)
    try {
      const body = await aiService.dailySignReading(sign, {
        tasksDone: stats.tasksDone,
        focusMin: stats.focusMinutes,
        waterMl: stats.waterMl,
      })
      await saveDailySignRecord(today) // 幂等：未入档先入档
      const rec = useDivinationStore
        .getState()
        .items.find((r) => r.type === 'daily_sign' && r.date === today)
      if (rec) await useDivinationStore.getState().update(rec.id, { aiReading: body })
      toast('个性化解读已生成', 'success')
    } catch {
      toast('AI 解读失败', 'danger')
    } finally {
      setReading(false)
    }
  }

  /** 大衍筮法：五十蓍草十八变成卦（《系辞》正统法） */
  const [dy, setDy] = useState<DayanState | null>(null)
  const dyDone = dy?.cast ?? null
  /** 分步：推进一变（每变 = 分二→挂一→揲四→归奇） */
  const nextBian = () => {
    if (!dy || dy.cast) return
    const before = dy.steps.length
    setDy(stepDayan(dy))
    playSound(before % 3 === 0 ? 'paper' : 'ui-click')
  }
  /** 一键完成剩余变数 */
  const finishDy = () => {
    if (!dy || dy.cast) return
    let st = dy
    while (!st.cast) st = stepDayan(st)
    setDy(st)
    playSound('seal')
    toast(`大衍成卦：${st.cast!.benGua.name}`, 'success')
  }
  const startDy = () => {
    setDy(initDayan())
    setExplain(null)
    playSound('ui-open')
  }
  const explainDy = async () => {
    if (!dyDone) return
    setExplaining('dayan')
    playSound('ui-open')
    try {
      const movingText = dyDone.dongYao
        ? `第 ${dyDone.dongYao} 爻（${yaoTitle(dyDone.dongYao, dyDone.lines[dyDone.dongYao - 1].value)}）动，之 ${dyDone.bianGua!.name} 卦`
        : '六爻安静'
      const data = `本卦 ${dyDone.benGua.name}，卦辞：${dyDone.benGua.guoci}；${movingText}。`
      const body = await aiService.occultExplain('dayan', data)
      setExplain({ title: 'AI 解卦', body })
    } catch {
      toast('AI 解释失败', 'danger')
    } finally {
      setExplaining(null)
    }
  }
  const saveDy = async () => {
    if (!dyDone) return
    const record: DivinationRecord = {
      id: createId(),
      type: 'dayan',
      date: today,
      title: `大衍筮法 · ${dyDone.benGua.name}${dyDone.dongYao ? `（动）` : ''}`,
      input: dyDone.seedNote,
      result: `本卦 ${dyDone.benGua.name}（${dyDone.benGua.xiang}）${dyDone.bianGua ? `· 变卦 ${dyDone.bianGua.name}` : '· 六爻安静'}；${dyDone.lines.map((l) => yaoTitle(l.index, l.value)).join('、')}`,
      interpretation: `${dyDone.summary}\n六爻：${dyDone.lines.map((l) => `${yaoTitle(l.index, l.value)}（${l.value}）`).join(' · ')}`,
      tags: ['大衍筮法'],
      createdAt: new Date().toISOString(),
    }
    await useDivinationStore.getState().add(record)
    void recordActivity({ entityType: 'divination', entityId: record.id, title: `大衍筮法 · ${dyDone.benGua.name}` })
    toast('卦已入档', 'success')
  }

  const meihuaCount = records.filter((r) => r.type === 'bagua').length
  const dayanCount = records.filter((r) => r.type === 'dayan').length

  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <h1 className="scribal-title text-3xl text-ink-bright">奇 · 玄机</h1>
          <p className="scribal mt-1.5 text-base text-ink-muted">阴阳不测之谓神</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-faint">
          <Badge tone="teal">梅花 {meihuaCount}</Badge>
          <Badge tone="cinnabar">大衍 {dayanCount}</Badge>
          <Badge tone="plain">签 {records.filter((r) => r.type === 'daily_sign').length}</Badge>
        </div>
      </div>

      {/* 今日签（全宽） */}
      <div className="grain-local rounded-paper border border-line px-4 py-5 sm:px-6">
        <Section
          title="今日签"
          hint={today}
          action={
            <Button size="sm" variant="secondary" onClick={saveDailySign}>
              记入档
            </Button>
          }
        >
          <div className="rounded-tile border border-line bg-paper/50 p-4">
            <div className="flex items-start gap-4">
              <Seal size={52} char={sign.tag} tone="cinnabar" rotate={-2} />
              <div className="min-w-0 flex-1">
                <div className="scribal-title text-lg text-ink">{sign.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{sign.text}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className="text-teal">宜 {sign.do}</span>
                  <span className="text-cinnabar">忌 {sign.dont}</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">{sign.advice}</p>
              </div>
              <div className="hidden shrink-0 sm:block">
                <BaguaWheel />
              </div>
            </div>
            {/* AI 个性化解读：生成后缓存，离线可回看 */}
            <div className="mt-3 border-t border-line/70 pt-3">
              {todaySignRecord?.aiReading ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
                  {todaySignRecord.aiReading}
                </p>
              ) : (
                <Button size="sm" variant="secondary" onClick={genSignReading} disabled={reading}>
                  <Sparkles size={13} /> {reading ? '解读中…' : 'AI 个性化解读'}
                </Button>
              )}
            </div>
          </div>
        </Section>
      </div>

      {/* 梅花易数：起卦四式 → 排盘 → 解卦 → 入档 */}
      <div className="mt-2 grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Section title="梅花易数" hint="体用生克 · 起卦四式">
            <div className="space-y-3">
              <div className="switch-pill flex flex-wrap gap-1 rounded-tile p-0.5">
                {(Object.keys(MEIHUA_METHOD_LABEL) as MeihuaMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMhMethod(m)}
                    className={cn(
                      'rounded-control px-2.5 py-1 text-xs transition-colors',
                      mhMethod === m ? 'switch-pill-active' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {MEIHUA_METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              {mhMethod === 'numbers' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="第一数" value={mhN1} onChange={(e) => setMhN1(e.target.value)} />
                  <Input type="number" placeholder="第二数" value={mhN2} onChange={(e) => setMhN2(e.target.value)} />
                </div>
              )}
              {mhMethod === 'words' && (
                <Input
                  placeholder="默念心中所想之事（按字数起卦）"
                  value={mhWords}
                  onChange={(e) => setMhWords(e.target.value)}
                />
              )}
              {mhMethod === 'time' && (
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  以当下公历年月日时为数（简化起卦法）：年+月+日定上卦，加时辰定下卦，总数取动爻。
                </p>
              )}
              {mhMethod === 'draw' && (
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  心中默念所占之事，点击起卦连抽三签：上卦、下卦、动爻。
                </p>
              )}
              <Button variant="primary" onClick={castMh} className="w-full">
                <Wand2 size={14} /> 起卦
              </Button>
            </div>
          </Section>
        </div>
        <div className="lg:col-span-7">
          <Section title="梅花排盘" hint={mh ? MEIHUA_METHOD_LABEL[mh.method] : '尚未起卦'}>
            {mh ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['本卦', mh.benGua, 'border-cinnabar/40'],
                    ['互卦', mh.huGua, 'border-line'],
                    ['变卦', mh.bianGua, 'border-gold-btn/40'],
                  ] as const).map(([label, g, border]) => (
                    <div key={label} className={cn('rounded-tile border bg-paper/50 p-3 text-center', border)}>
                      <div className="text-[10px] tracking-[0.2em] text-ink-faint">{label}</div>
                      <div className="scribal-title mt-1 text-xl text-ink">{g.name}</div>
                      <div className="mt-0.5 text-[11px] text-ink-faint">{g.xiang}</div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-muted">{g.guoci}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-tile border border-line bg-paper/50 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-ink">
                      体 <span className="font-medium text-teal">{mh.ti.trigram.name}·{mh.ti.element}</span>
                    </span>
                    <span className="text-ink-faint">／</span>
                    <span className="text-ink">
                      用 <span className="font-medium text-cinnabar">{mh.yong.trigram.name}·{mh.yong.element}</span>
                    </span>
                    <span className="ml-auto text-xs text-ink-faint">动爻第 {mh.dongYao} 爻</span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-soft">{mh.relation}。</p>
                  <p className={cn('mt-0.5 text-sm font-medium', mh.verdict === '凶' || mh.verdict === '小凶' ? 'text-cinnabar' : 'text-teal')}>
                    断曰：{mh.verdict}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{mh.summary}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={explainMh} disabled={explaining === 'meihua'}>
                    <Sparkles size={12} /> {explaining === 'meihua' ? '解读中…' : 'AI 白话解读'}
                  </Button>
                  <Button size="sm" variant="tertiary" onClick={saveMh}>
                    入档
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Wand2}
                title="尚未起卦"
                desc="四种起卦方式：年月日时、报两数、默念字占、抽签"
                step="左侧选择起卦方式后点击「起卦」"
              />
            )}
          </Section>
        </div>
      </div>

      {/* 大衍筮法：五十蓍草十八变成卦（《系辞》正统法） */}
      <div className="mt-2 grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Section title="大衍筮法" hint="《系辞》正统 · 十八变成卦">
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-ink-faint">
                大衍之数五十，其用四十九。每爻分二、挂一、揲四、归奇，三变得一爻，十八变而成卦——起卦最繁复，亦最庄重。
              </p>
              {!dy && (
                <Button variant="ritual" onClick={startDy} className="w-full">
                  <Wand2 size={14} /> 建局（其用四十九）
                </Button>
              )}
              {dy && !dy.cast && (
                <div className="space-y-2">
                  <Button variant="primary" onClick={nextBian} className="w-full">
                    推进一变（第 {dy.steps.length + 1} / 18 变）
                  </Button>
                  <Button variant="tertiary" onClick={finishDy} className="w-full">
                    余变从简 · 直至成卦
                  </Button>
                </div>
              )}
            </div>
          </Section>
        </div>
        <div className="lg:col-span-7">
          <Section title="大衍排盘" hint={dyDone ? `十八变毕 · 六爻成卦` : dy ? `进行中 · ${dy.steps.length} / 18 变` : '尚未建局'}>
            {dyDone ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-tile border border-cinnabar/40 bg-paper/50 p-3 text-center">
                    <div className="text-[10px] tracking-[0.2em] text-ink-faint">本卦</div>
                    <div className="scribal-title mt-1 text-xl text-ink">{dyDone.benGua.name}</div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">{dyDone.benGua.xiang}</div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-muted">{dyDone.benGua.guoci}</p>
                  </div>
                  <div className="rounded-tile border border-line bg-paper/50 p-3 text-center flex flex-col items-center justify-center">
                    <div className="text-[10px] tracking-[0.2em] text-ink-faint">动爻</div>
                    <div className="scribal-title mt-1 text-xl text-ink">
                      {dyDone.dongYao ? yaoTitle(dyDone.dongYao, dyDone.lines[dyDone.dongYao - 1].value) : '静'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">{dyDone.dongYao ? '老阴/老阳' : '六爻安静'}</div>
                  </div>
                  <div className="rounded-tile border border-gold-btn/40 bg-paper/50 p-3 text-center">
                    <div className="text-[10px] tracking-[0.2em] text-ink-faint">变卦</div>
                    <div className="scribal-title mt-1 text-xl text-ink">{dyDone.bianGua?.name ?? '—'}</div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">{dyDone.bianGua?.xiang ?? '六爻不变'}</div>
                  </div>
                </div>
                {/* 六爻爻题行 */}
                <div className="flex flex-wrap gap-1.5">
                  {dyDone.lines.map((l) => (
                    <span key={l.index} className="rounded-control border border-line bg-raised px-2 py-0.5 text-[11px] tabular text-ink-muted">
                      {yaoTitle(l.index, l.value)}（{l.value}）
                    </span>
                  ))}
                </div>
                <p className="text-[13px] leading-relaxed text-ink-muted">{dyDone.summary}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={explainDy} disabled={explaining === 'dayan'}>
                    <Sparkles size={12} /> {explaining === 'dayan' ? '解读中…' : 'AI 白话解读'}
                  </Button>
                  <Button size="sm" variant="tertiary" onClick={saveDy}>
                    入档
                  </Button>
                </div>
              </div>
            ) : dy && !dy.cast ? (
              <div className="space-y-2 rounded-tile border border-line bg-paper/50 p-4 text-sm">
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span>第 {Math.floor(dy.steps.length / 3) + 1} 爻 · 第 {(dy.steps.length % 3) + 1} 变</span>
                    <span className="tabular">蓍草余 {dy.currentRemaining}</span>
                  </div>
                  {dy.steps.length > 0 && (
                    <p className="text-[13px] text-ink-soft">
                      上一变：分二 {dy.steps[dy.steps.length - 1].left} + {dy.steps[dy.steps.length - 1].right}
                      {dy.steps[dy.steps.length - 1].suspended ? ` · 挂一 ${dy.steps[dy.steps.length - 1].suspended}` : ''}
                      {' '}→ 归奇 {dy.steps[dy.steps.length - 1].odd}
                    </p>
                  )}
                  <p className="text-[11px] text-ink-faint">点击左侧「推进一变」，三变成一爻，十八变成卦</p>
                </div>
              ) : (
                <EmptyState
                  icon={Wand2}
                  title="尚未建局"
                  desc="大衍之数五十，其用四十九"
                  step="点击「建局」开始十八变"
                />
              )
            }
          </Section>
        </div>
      </div>

      {/* 常用工具 + 历史 */}
      <div className="mt-2 grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Section title="常用工具" hint="快捷入口">
            <div className="grid grid-cols-2 gap-2">
              <ToolTile icon={ScrollText} label="记今日签" desc="签文入档" onClick={saveDailySign} />
              <ToolTile
                icon={Sparkles}
                label="每日签"
                desc="今日所宜所忌"
                onClick={async () => {
                  const { sign: s } = await saveDailySignRecord(today)
                  toast(`${s.tag} · ${s.title} —— ${s.text}`)
                }}
              />
            </div>
          </Section>
        </div>
        <div className="lg:col-span-7">
          <Section
            title="历史"
            hint={`${records.length} 次 · 占卜存档`}
            action={<History size={14} className="text-ink-faint" />}
          >
            {records.length > 0 ? (
              <div>
                {records
                  .slice()
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 12)
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() => useInspectorStore.getState().open('divination', r.id)}
                      className="row w-full text-left"
                    >
                      <span className="tabular text-xs text-ink-faint">{r.date}</span>
                      <span className="flex-1 truncate text-sm text-ink">{r.title}</span>
                      <Badge tone={r.type === 'bagua' || r.type === 'dayan' ? 'teal' : r.type === 'daily_sign' ? 'cinnabar' : 'plain'}>
                        {r.type === 'daily_sign' ? '每日签' : r.type === 'bagua' ? '梅花' : r.type === 'dayan' ? '大衍' : r.type}
                      </Badge>
                    </button>
                  ))}
              </div>
            ) : (
              <EmptyState
                icon={History}
                title="暂无占卜记录"
                desc="起卦、记签后会自动留档"
                step="先起一卦或记一签"
              />
            )}
          </Section>
        </div>
      </div>

      {/* AI 解释 */}
      <Dialog
        open={explain != null}
        onClose={() => setExplain(null)}
        title={explain?.title ?? ''}
        footer={
          <Button variant="primary" onClick={() => setExplain(null)}>知道了</Button>
        }
      >
        <pre className="whitespace-pre-wrap rounded-tile border border-line bg-paper/70 p-4 font-sans text-sm leading-relaxed text-ink-soft">
          {explain?.body}
        </pre>
        <p className="mt-2 text-[11px] text-ink-faint">AI 仅解释结构，卦象由算法生成，不由 AI 决定。</p>
      </Dialog>
    </div>
  )
}

/** 常用工具入口 */
function ToolTile({
  icon: Icon,
  label,
  desc,
  onClick,
}: {
  icon: typeof History
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-tile border border-line bg-paper/50 px-4 py-3 text-left transition-colors hover:border-cinnabar/40 hover:bg-cinnabar/5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-raised text-ink-muted group-hover:text-cinnabar">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-[11px] text-ink-faint">{desc}</span>
      </span>
    </button>
  )
}

/** 九宫格盘面（洛书数位 · 天干/八门/九星/八神） */
function BaguaWheel() {
  const R = 46
  const bagua = [...BAGUA]
  // 五行：恰好五个，沿中环均布（各配五行色小印）
  const WUXING = [
    { el: '金', color: 'var(--color-module-3)' },
    { el: '木', color: 'var(--color-module-4)' },
    { el: '水', color: 'var(--color-module-2)' },
    { el: '火', color: 'var(--color-module-1)' },
    { el: '土', color: 'var(--color-module-5)' },
  ]
  const angle = (i: number, n: number) => ((i * 360) / n - 90) * (Math.PI / 180)
  const pt = (r: number, a: number) => ({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r })

  return (
    <div className="mx-auto flex max-w-[380px] flex-col items-center">
      <div className="relative w-full">
        <svg viewBox="0 0 100 100" className="w-full">
          {/* 外环 + 鎏金环（骨架全部鎏金，弃灰） */}
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.8" opacity="0.9" />
          <circle cx="50" cy="50" r={R - 6} fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.4" strokeDasharray="1 2" opacity="0.55" />
          <circle cx="50" cy="50" r="42.5" fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.3" strokeDasharray="0.6 2" opacity="0.7" />
          {/* 24 刻度（仅此组旋转；四正位朱砂强调；内端让开八卦圈；余者鎏金） */}
          <g className="compass-slow">
            {Array.from({ length: 24 }, (_, i) => {
              const a = angle(i, 24)
              const r1 = R - (i % 3 === 0 ? 2.6 : 1.6)
              const p1 = pt(r1, a)
              const p2 = pt(R, a)
              const cardinal = i % 6 === 0
              return (
                <line
                  key={i}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={cardinal ? 'var(--color-cinnabar)' : 'var(--color-gold-btn)'}
                  strokeWidth={cardinal ? 0.7 : i % 3 === 0 ? 0.5 : 0.35}
                  opacity={cardinal ? 0.8 : 0.6}
                />
              )
            })}
          </g>
          {/* 四方方位字与刻度/卦位相撞，改为省略（方位由卦名圈内的卦名表达） */}
          {/* 中环：五行（恰五个，固定不转；半径 27 与外环八卦留出净空） */}
          {WUXING.map((el, i) => {
            const a = angle(i, 5)
            const p = pt(27, a)
            return (
              <g key={el.el}>
                <rect
                  x={p.x - 2.8}
                  y={p.y - 2.8}
                  width="5.6"
                  height="5.6"
                  rx="0.7"
                  transform={`rotate(45 ${p.x} ${p.y})`}
                  fill={el.color}
                  opacity="0.92"
                />
                <text
                  x={p.x}
                  y={p.y + 1}
                  textAnchor="middle"
                  fontSize="3.8"
                  fill="var(--color-panel)"
                  style={{ fontFamily: 'var(--font-deco)' }}
                >
                  {el.el}
                </text>
              </g>
            )
          })}
          {/* 外环：八卦（半径 37，卦名收进圆内，不再与刻度相撞） */}
          {bagua.map((b, i) => {
            const a = angle(i, 8)
            const p = pt(37, a)
            return (
              <g key={b.key}>
                <circle cx={p.x} cy={p.y} r="5.2" fill="var(--color-panel)" stroke="var(--color-gold-btn)" strokeWidth="0.45" opacity="0.95" />
                <text x={p.x} y={p.y - 0.4} textAnchor="middle" fontSize="5.4" fill="var(--color-ink)" style={{ fontFamily: 'var(--font-deco)' }}>
                  {b.symbol}
                </text>
                <text x={p.x} y={p.y + 3.4} textAnchor="middle" fontSize="2.1" fill="var(--color-ink-faint)">
                  {b.name}
                </text>
              </g>
            )
          })}
          {/* 内环：阴阳 */}
          <circle cx="50" cy="50" r="19" fill="none" stroke="var(--color-cinnabar)" strokeWidth="0.5" opacity="0.55" />
          <circle cx="50" cy="50" r="19" fill="none" stroke="var(--color-cinnabar)" strokeWidth="0.5" strokeDasharray="6 1 2 1" opacity="0.35" />
        </svg>
        {/* 中心太极（当前状态）：同观页锚定真实圆心，不依赖容器内容分布 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Taiji size={34} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">异术阵 · 外环八卦 · 中环五行 · 内环阴阳 · 中心太极</p>
    </div>
  )
}
