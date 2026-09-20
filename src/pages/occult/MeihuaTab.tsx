/**
 * 奇 · 梅花易数页签：先问事 → 起卦四式 → 排盘 → 解卦 → 入档
 * 状态自持（含自身的 AI 解卦弹窗），对外零 props。
 */
import { useState } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import { useDivinationStore } from '../../stores/useDivinationStore'
import { castMeihua, MEIHUA_METHOD_LABEL, type MeihuaCast, type MeihuaMethod } from '../../services/occult/meihua'
import { aiService } from '../../services/ai/ai-service'
import { recordActivity } from '../../services/activity'
import { playSound } from '../../services/sound'
import type { DivinationRecord } from '../../types/entities'
import { createId, todayISO, nowISO } from '../../utils/id'
import { cn } from '../../utils/cn'
import { Button, EmptyState, Input, Section, useToast } from '../../components/ui'
import { ExplainDialog } from './ExplainDialog'

export function MeihuaTab() {
  const today = todayISO()
  const toast = useToast().toast

  const [explain, setExplain] = useState<{ title: string; body: string } | null>(null)
  const [explaining, setExplaining] = useState<string | null>(null)

  /** AI 白话解读（梅花） */
  const [mhMethod, setMhMethod] = useState<MeihuaMethod>('numbers')
  const [mhQuestion, setMhQuestion] = useState('')
  const [mhN1, setMhN1] = useState('')
  const [mhN2, setMhN2] = useState('')
  const [mhWords, setMhWords] = useState('')
  const [mh, setMh] = useState<MeihuaCast | null>(null)

  const castMh = () => {
    try {
      const c = castMeihua(mhMethod, {
        question: mhQuestion,
        n1: Number(mhN1),
        n2: Number(mhN2),
        words: mhWords,
      })
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
      const body = await aiService.occultExplain('meihua', data, mh.question)
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
      createdAt: nowISO(),
    }
    await useDivinationStore.getState().add(record)
    void recordActivity({ entityType: 'divination', entityId: record.id, title: `梅花易数 · ${mh.benGua.name}` })
    toast('卦已入档', 'success')
  }

  return (
    <>
      <div className="mt-2 grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Section title="梅花易数" hint="先问一事，再起卦">
            <div className="space-y-3">
              {/* 所问之事：先有问，才有占；传参给排盘与 AI 解卦 */}
              <Input
                placeholder="所占之事（如：这次面试顺利吗）"
                value={mhQuestion}
                onChange={(e) => setMhQuestion(e.target.value)}
                maxLength={60}
              />
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
                <p className="text-xs leading-relaxed text-ink-faint">
                  以当下公历年月日时为数（简化起卦法）：年+月+日定上卦，加时辰定下卦，总数取动爻。
                </p>
              )}
              {mhMethod === 'draw' && (
                <p className="text-xs leading-relaxed text-ink-faint">
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
                      <div className="text-xs tracking-[0.2em] text-ink-faint">{label}</div>
                      <div className="scribal-title mt-1 text-xl text-ink">{g.name}</div>
                      <div className="mt-0.5 text-xs text-ink-faint">{g.xiang}</div>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">{g.guoci}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-tile border border-line bg-paper/50 px-3 py-2.5 text-sm">
                  {/* 所占之事：问卦回看时仍有据可循 */}
                  {mh.question && (
                    <p className="mb-1.5 border-b border-line/60 pb-1.5 text-xs text-ink-muted">
                      所占：<span className="text-ink">{mh.question}</span>
                    </p>
                  )}
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
                  <p className="mt-1 text-sm text-ink-soft">{mh.relation}。</p>
                  <p className={cn('mt-0.5 text-sm font-medium', mh.verdict === '凶' || mh.verdict === '小凶' ? 'text-cinnabar' : 'text-teal')}>
                    断曰：{mh.verdict}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{mh.summary}</p>
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
      <ExplainDialog explain={explain} onClose={() => setExplain(null)} />
    </>
  )
}
