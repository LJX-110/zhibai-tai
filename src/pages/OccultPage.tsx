/**
 * 奇 —— 视觉实验场（今日奇门状态 + 八卦圆阵 + 排盘 + 历史 + 常用工具）
 * 圆阵/九宫等结构服务于信息表达；本页允许更明显的局部纸纹材质
 */
import { useState } from 'react'
import { Compass, History, ScrollText, Sparkles, Wand2 } from 'lucide-react'
import { useDivinationStore, saveDailySignRecord } from '../stores/useDivinationStore'
import { BAGUA, signOf, tossCoins } from '../services/divination'
import { analyzeLiuyao, lineSymbol, type LiuyaoAnalysis } from '../services/occult/liuyao'
import { qimenFromString, type QimenPan } from '../services/occult/qimen'
import { interpretLiuyao, interpretQimen } from '../services/occult/interpretation'
import { aiService } from '../services/ai/ai-service'
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
  const [guah, setGuah] = useState<LiuyaoAnalysis | null>(null)
  const [pan, setPan] = useState<QimenPan | null>(null)
  const [explain, setExplain] = useState<{ title: string; body: string } | null>(null)
  const [explaining, setExplaining] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const toast = useToast().toast
  const records = useDivinationStore((s) => s.items)

  /** AI 解释（只解释，不决定卦象/盘面；结合占问之事给现代解读） */
  const explainResult = async (kind: 'liuyao' | 'qimen') => {
    if (kind === 'liuyao' && !guah) return
    if (kind === 'qimen' && !pan) return
    setExplaining(kind)
    playSound('ui-open')
    try {
      const data =
        kind === 'liuyao'
          ? guah!.lines.map((l) => `${l.index}爻 ${l.shen} ${l.zhi}${l.element} ${l.qin}${l.position} 变${l.changing ? '动' : '静'}`).join('；') + `；本卦 ${guah!.benGua.name}，变卦 ${guah!.bianGua?.name ?? '无'}`
          : `局 ${pan!.dun}遁${pan!.ju}局；节气 ${pan!.jieqi}；旬首 ${pan!.xunShou}；值符 ${pan!.zhifu} 值使 ${pan!.zhishi}`
      const body = await aiService.occultExplain(kind, data, question)
      setExplain({
        title: kind === 'liuyao' ? 'AI 解卦' : 'AI 解盘',
        body: question.trim() ? `占问：${question.trim()}\n${body}` : body,
      })
    } catch {
      toast('AI 解释失败', 'danger')
    } finally {
      setExplaining(null)
    }
  }

  const toss = () => {
    const seed = Date.now() + Math.floor(Math.random() * 1000)
    const coins = tossCoins(seed)
    const result = analyzeLiuyao(
      coins.map((l, i) => ({
        index: i + 1,
        value: (l.coin === 'yang' || l.coin === 'changing-yang' ? 1 : 0) as 0 | 1,
        changing: l.coin === 'changing-yang' || l.coin === 'changing-yin',
      })),
    )
    setGuah(result)
    playSound('qimen')
    const linesText = result.lines
      .map((l) => `${l.index} 爻：${l.shen} ${l.zhi} ${l.element} ${l.qin}${l.position ? `（${l.position}）` : ''} ${lineSymbol(l.value, l.changing)}`)
      .join('\n')
    const record: DivinationRecord = {
      id: createId(),
      type: 'hexagram',
      date: today,
      title: `六爻 · ${result.benGua.name}${result.bianGua ? ` → ${result.bianGua.name}` : ''}`,
      input: `${question.trim() ? `问事：${question.trim()} · ` : ''}种子 ${seed} · ${new Date().toLocaleString('zh-CN')}`,
      result: `${result.benGua.name}（${result.palace}宫${result.palaceElement}，世${result.shiYao}应${result.yingYao}）${result.bianGua ? `，变卦 ${result.bianGua.name}` : ''}`,
      interpretation: `${result.dayGanZhi}日 · ${result.monthGanZhi}月 · ${result.yearGanZhi}年；传统断卦需人工参详，此处仅结构化排卦。`,
      detail: linesText,
      raw: result.lines.map((l) => lineSymbol(l.value, l.changing)).join(' | '),
      tags: ['六爻', result.palace + '宫', ...(result.changingCount > 0 ? ['动爻'] : [])],
      createdAt: new Date().toISOString(),
    }
    void useDivinationStore.getState().add(record)
    void recordActivity({ entityType: 'divination', entityId: record.id, title: `六爻起卦 · ${result.benGua.name}` })
    toast('卦已成', 'success')
  }

  /** 奇门排盘：由当前时间生成盘面并保存 */
  const qimen = () => {
    const now = new Date()
    const p = qimenFromString(now.toISOString())
    setPan(p)
    playSound('compass')
    const record: DivinationRecord = {
      id: createId(),
      type: 'qimen',
      date: today,
      title: `奇门 · ${p.dun}遁${p.ju}局`,
      input: `${question.trim() ? `问事：${question.trim()} · ` : ''}${p.timeLabel}`,
      result: JSON.stringify(p),
      interpretation: p.notes.join(' '),
      tags: ['奇门', `${p.dun}遁`, `${p.ju}局`],
      createdAt: now.toISOString(),
    }
    void useDivinationStore.getState().add(record)
    void recordActivity({ entityType: 'divination', entityId: record.id, title: `奇门排盘 · ${p.dun}遁${p.ju}局` })
    toast(`奇门排盘：${p.dun}遁${p.ju}局`, 'success')
  }

  /** 记今日签：把今天的签存档为记录（与命令面板共用 saveDailySignRecord） */
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

  const hexCount = records.filter((r) => r.type === 'hexagram').length
  const qimenCount = records.filter((r) => r.type === 'qimen').length

  return (
    <div className="mx-auto max-w-[var(--content-max-w)]">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <h1 className="scribal-title text-3xl text-ink-bright">奇 · 玄机</h1>
          <p className="scribal mt-1.5 text-base text-ink-muted">阴阳不测之谓神</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-faint">
          <Badge tone="cinnabar">六爻 {hexCount}</Badge>
          <Badge tone="bronze">奇门 {qimenCount}</Badge>
          <Badge tone="plain">签 {records.filter((r) => r.type === 'daily_sign').length}</Badge>
        </div>
      </div>

      <div className="grain-local rounded-paper border border-line px-4 py-5 sm:px-6">
        {/* 左：今日签 + 八卦圆阵；右：排盘 */}
        <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Section
              title="今日签"
              hint={today}
              action={
                <Button size="sm" variant="secondary" onClick={saveDailySign}>
                  记入档
                </Button>
              }
            >
              <div className="flex items-center gap-4 rounded-tile border border-line bg-panel/70 p-4">
                {/* 每日签签章：圆形符箓（与全局符箓语言一致） */}
                <Seal size={52} char={sign.tag} tone="cinnabar" rotate={-2} />
                <div className="min-w-0">
                  <div className="scribal-title text-lg text-ink">{sign.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{sign.text}</p>
                </div>
              </div>
            </Section>

            <Section title="八卦" hint="后天方位 · 罗盘结构">
              <BaguaWheel />
            </Section>
          </div>

          <div className="lg:col-span-7">
            {/* 问事：先写你想问的，起卦/起盘后 AI 据此解读 */}
            <div className="mb-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="scribal text-sm text-cinnabar">问事</span>
                <span className="text-[11px] text-ink-faint">先写下你想占问的事，起卦/起盘后 AI 据此解读</span>
              </div>
              <Input
                placeholder="例如：这周要不要换实习方向？考试能不能过？…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <Section
              title="六爻"
              hint="本卦 / 动爻 / 变卦 · 世应六亲纳甲"
              action={
                <Button variant="ritual" size="sm" onClick={toss}>
                  <Wand2 size={13} /> 起卦
                </Button>
              }
            >
              {guah ? (
                <div className="rounded-tile border border-line bg-panel/70 p-5">
                  {/* 本卦 / 变卦 */}
                  <div className="mb-3 flex items-center justify-center gap-4">
                    <div className="text-center">
                      <div className="display text-lg font-semibold text-ink">{guah.benGua.name}</div>
                      <div className="text-xs text-ink-muted">
                        {guah.benGua.lower.symbol}{guah.benGua.upper.symbol} {guah.palace}宫{guah.palaceElement}
                      </div>
                    </div>
                    {guah.bianGua && (
                      <>
                        <span className="text-ink-faint">→</span>
                        <div className="text-center">
                          <div className="display text-lg font-semibold text-cinnabar">{guah.bianGua.name}</div>
                          <div className="text-xs text-ink-muted">
                            {guah.bianGua.lower.symbol}{guah.bianGua.upper.symbol} 变卦
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* 年月日时干支 */}
                  <div className="mb-3 flex flex-wrap justify-center gap-1.5 text-[11px] text-ink-faint">
                    <Badge tone="plain">{guah.yearGanZhi}年</Badge>
                    <Badge tone="plain">{guah.monthGanZhi}月</Badge>
                    <Badge tone="cinnabar">{guah.dayGanZhi}日</Badge>
                    <Badge tone="bronze">{guah.hourGanZhi}时</Badge>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    {[...guah.lines].reverse().map((l) => (
                      <div key={l.index} className="flex items-center gap-2.5">
                        <span className={cn('w-6 text-right text-[11px]', l.position === '世' ? 'text-cinnabar' : l.position === '应' ? 'text-bronze' : 'text-ink-faint')}>
                          {l.position || `${l.index}`}
                        </span>
                        <span className="tabular w-6 text-right text-[11px] text-ink-faint">{l.zhi}</span>
                        <span className="w-8 text-center text-[11px] text-ink-faint">{l.qin}</span>
                        <span className={cn('text-xl font-mono', l.changing ? 'text-cinnabar' : 'text-ink')}>
                          {lineSymbol(l.value, l.changing).replace('（动）', '')}
                        </span>
                        <span className="w-6 text-[11px] text-ink-muted">{l.shen}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-center text-[11px] text-ink-faint">
                    动爻 {guah.changingCount} 处 · 世{guah.shiYao}应{guah.yingYao} · 月建/时支为简化近似，传统断卦需人工参详
                  </p>
                  {/* 结构解读（非吉凶断言） */}
                  <div className="mt-3 space-y-1 rounded-tile border border-teal/20 bg-teal/5 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
                    {interpretLiuyao(guah).map((l, i) => (
                      <p key={i}>· {l}</p>
                    ))}
                  </div>
                  <div className="mt-2 text-center">
                    <Button size="sm" variant="tertiary" onClick={() => explainResult('liuyao')} disabled={explaining === 'liuyao'}>
                      <Sparkles size={12} /> {explaining === 'liuyao' ? '解释中…' : 'AI 解释'}
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Wand2}
                  title="尚未起卦"
                  desc="点击「起卦」以三枚铜钱之法得六爻（动爻以朱砂标注）"
                  step="铜钱六掷，得本卦与动爻"
                />
              )}
            </Section>

            <Section
              title="奇门"
              hint="简化排盘 · 阴阳遁 / 九宫 / 八门 / 九星 / 八神"
              action={
                <Button variant="ritual" size="sm" onClick={qimen}>
                  <Compass size={13} /> 起盘
                </Button>
              }
            >
              {pan ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="display font-semibold text-cinnabar">
                      {pan.dun}遁{pan.ju}局
                    </span>
                    <span className="text-xs text-ink-muted">{pan.timeLabel} · {pan.yearGanZhi}年</span>
                  </div>
                  <NinePalace pan={pan} />
                  {pan.jieqi && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Badge tone="cinnabar">节气 {pan.jieqi}</Badge>
                      {pan.yuan && <Badge tone="teal">{pan.yuan}</Badge>}
                      <Badge tone="bronze">旬首 {pan.xunShou}</Badge>
                      {pan.zhifu && <Badge tone="plain">值符 {pan.zhifu}</Badge>}
                      {pan.zhishi && <Badge tone="plain">值使 {pan.zhishi}</Badge>}
                      {pan.dayGanZhi && pan.hourGanZhi && (
                        <span className="text-ink-faint">日 {pan.dayGanZhi} · 时 {pan.hourGanZhi}</span>
                      )}
                    </div>
                  )}
                  <ul className="mt-2 space-y-1 text-[11px] text-ink-faint">
                    {pan.notes.map((n, i) => (
                      <li key={i}>· {n}</li>
                    ))}
                  </ul>
                  {/* 结构解读（非吉凶断言） */}
                  <div className="mt-2 space-y-1 rounded-tile border border-teal/20 bg-teal/5 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
                    {interpretQimen(pan).map((l, i) => (
                      <p key={i}>· {l}</p>
                    ))}
                  </div>
                  <div className="mt-2">
                    <Button size="sm" variant="tertiary" onClick={() => explainResult('qimen')} disabled={explaining === 'qimen'}>
                      <Sparkles size={12} /> {explaining === 'qimen' ? '解释中…' : 'AI 解释'}
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Compass}
                  title="尚未起盘"
                  desc="按当前时间起盘（简化占法）：定阴阳遁、局数，排九宫盘面"
                  step="点击「起盘」生成当前时辰盘面"
                />
              )}
            </Section>
          </div>
        </div>
      </div>

      {/* 常用工具 + 历史 */}
      <div className="mt-2 grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Section title="常用工具" hint="快捷入口">
            <div className="grid grid-cols-2 gap-2">
              <ToolTile icon={Wand2} label="六爻起卦" desc="铜钱之法" onClick={toss} />
              <ToolTile icon={Compass} label="奇门排盘" desc="当前时辰" onClick={qimen} />
              <ToolTile icon={ScrollText} label="记今日签" desc="签文入档" onClick={saveDailySign} />
              <ToolTile
                icon={Sparkles}
                label="每日签"
                desc="今日所宜所忌"
                onClick={async () => {
                  // P0-C 修复：此前为空 handler，点击无任何反应
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
                      {r.raw && <span className="hidden font-mono text-sm text-ink-muted sm:inline">{r.raw}</span>}
                      <Badge tone={r.type === 'hexagram' ? 'cinnabar' : r.type === 'qimen' ? 'bronze' : 'plain'}>
                        {r.type === 'daily_sign' ? '每日签' : r.type === 'hexagram' ? '六爻' : r.type === 'qimen' ? '奇门' : r.type}
                      </Badge>
                    </button>
                  ))}
              </div>
            ) : (
              <EmptyState
                icon={History}
                title="暂无占卜记录"
                desc="起卦、排盘、记签后会自动留档"
                step="先起一卦或排一盘"
              />
            )}
          </Section>
        </div>
      </div>

      {/* AI 解释（只解释，不决定卦象/盘面） */}
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
        <p className="mt-2 text-[11px] text-ink-faint">AI 仅解释结构，卦象与盘面由算法生成，不由 AI 决定。</p>
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
  icon: typeof Compass
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-tile border border-line bg-panel/60 px-4 py-3 text-left transition-colors hover:border-cinnabar/40 hover:bg-cinnabar/5"
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
function NinePalace({ pan }: { pan: QimenPan }) {
  const cells = [...pan.palaces].sort((a, b) => a.y - b.y || a.x - b.x)
  return (
    <div className="grid grid-cols-3 gap-1 rounded-control border border-line p-1">
      {cells.map((p) => (
        <div
          key={`${p.x}-${p.y}`}
          className={cn(
            'flex min-h-[74px] flex-col items-center justify-center rounded-control border border-line/60 p-1 text-center',
            p.number === 5 ? 'bg-nested/40' : 'bg-raised',
          )}
        >
          <div className="tabular text-[10px] text-ink-faint">
            {p.number === 5 ? '中' : `${p.pos}${p.number}`}
          </div>
          <div className="display mt-0.5 text-base font-semibold text-ink">{p.tianGan ?? ''}</div>
          <div className="text-[11px] text-cinnabar">{p.men ?? ''}</div>
          <div className="text-[10px] text-ink-muted">{p.xing}</div>
          <div className="text-[10px] text-bronze">{p.shen ?? ''}</div>
        </div>
      ))}
    </div>
  )
}

/** 异术阵 —— 多环罗盘（外环八卦 / 中环五行 / 内环阴阳 / 中心异印）
 *  旋转仅作用于 24 刻度组；八卦与五行固定不转；五行恰为金木水火土 */
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
        {/* 中心太极（当前状态） */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Taiji size={34} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">异术阵 · 外环八卦 · 中环五行 · 内环阴阳 · 中心太极</p>
    </div>
  )
}
