/**
 * 奇 · 大衍筮法页签：五十蓍草十八变成卦（《系辞》正统法）
 * 状态自持（含自身的 AI 解卦弹窗），对外零 props。
 */
import { useState } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import { useDivinationStore } from '../../stores/useDivinationStore'
import { initDayan, stepDayan, yaoTitle, type DayanState } from '../../services/occult/dayan'
import { aiService } from '../../services/ai/ai-service'
import { recordActivity } from '../../services/activity'
import { playSound } from '../../services/sound'
import type { DivinationRecord } from '../../types/entities'
import { createId, todayISO, nowISO } from '../../utils/id'
import { Button, EmptyState, Input, Section, useToast } from '../../components/ui'
import { ExplainDialog } from './ExplainDialog'

export function DayanTab() {
  const today = todayISO()
  const toast = useToast().toast

  const [explain, setExplain] = useState<{ title: string; body: string } | null>(null)
  const [explaining, setExplaining] = useState<string | null>(null)

  /** 大衍筮法：五十蓍草十八变成卦（《系辞》正统法） */
  const [dy, setDy] = useState<DayanState | null>(null)
  const [dyQuestion, setDyQuestion] = useState('')
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
      const data = `本卦 ${dyDone.benGua.name}，卦辞：${dyDone.benGua.guoci}；${movingText}。${dyQuestion ? `所占之事：${dyQuestion}` : ''}`
      const body = await aiService.occultExplain('dayan', data, dyQuestion)
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
      createdAt: nowISO(),
    }
    await useDivinationStore.getState().add(record)
    void recordActivity({ entityType: 'divination', entityId: record.id, title: `大衍筮法 · ${dyDone.benGua.name}` })
    toast('卦已入档', 'success')
  }

  return (
    <>
      <div className="mt-2 grid grid-cols-1 gap-x-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Section title="大衍筮法" hint="十八变成卦">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-ink-faint">
                大衍之数五十，其用四十九。每爻分二、挂一、揲四、归奇，三变得一爻，十八变而成卦——起卦最繁复，亦最庄重。
              </p>
              {/* 所占之事：建局前先问事（AI 解卦会结合此问） */}
              <Input
                placeholder="所占之事（如：这学期该修哪门课）"
                value={dyQuestion}
                onChange={(e) => setDyQuestion(e.target.value)}
                maxLength={60}
                disabled={Boolean(dy)}
              />
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
                {dyQuestion && (
                  <p className="rounded-tile border border-line bg-paper/50 px-3 py-2 text-xs text-ink-muted">
                    所占：<span className="text-ink">{dyQuestion}</span>
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-tile border border-cinnabar/40 bg-paper/50 p-3 text-center">
                    <div className="text-xs tracking-[0.2em] text-ink-faint">本卦</div>
                    <div className="scribal-title mt-1 text-xl text-ink">{dyDone.benGua.name}</div>
                    <div className="mt-0.5 text-xs text-ink-faint">{dyDone.benGua.xiang}</div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">{dyDone.benGua.guoci}</p>
                  </div>
                  <div className="rounded-tile border border-line bg-paper/50 p-3 text-center flex flex-col items-center justify-center">
                    <div className="text-xs tracking-[0.2em] text-ink-faint">动爻</div>
                    <div className="scribal-title mt-1 text-xl text-ink">
                      {dyDone.dongYao ? yaoTitle(dyDone.dongYao, dyDone.lines[dyDone.dongYao - 1].value) : '静'}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-faint">{dyDone.dongYao ? '老阴/老阳' : '六爻安静'}</div>
                  </div>
                  <div className="rounded-tile border border-gold-btn/40 bg-paper/50 p-3 text-center">
                    <div className="text-xs tracking-[0.2em] text-ink-faint">变卦</div>
                    <div className="scribal-title mt-1 text-xl text-ink">{dyDone.bianGua?.name ?? '—'}</div>
                    <div className="mt-0.5 text-xs text-ink-faint">{dyDone.bianGua?.xiang ?? '六爻不变'}</div>
                  </div>
                </div>
                {/* 六爻爻题行 */}
                <div className="flex flex-wrap gap-1.5">
                  {dyDone.lines.map((l) => (
                    <span key={l.index} className="rounded-control border border-line bg-raised px-2 py-0.5 text-xs tabular text-ink-muted">
                      {yaoTitle(l.index, l.value)}（{l.value}）
                    </span>
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-ink-muted">{dyDone.summary}</p>
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
                    <p className="text-sm text-ink-soft">
                      上一变：分二 {dy.steps[dy.steps.length - 1].left} + {dy.steps[dy.steps.length - 1].right}
                      {dy.steps[dy.steps.length - 1].suspended ? ` · 挂一 ${dy.steps[dy.steps.length - 1].suspended}` : ''}
                      {' '}→ 归奇 {dy.steps[dy.steps.length - 1].odd}
                    </p>
                  )}
                  {/* 原先这里还有一行「点击左侧『推进一变』，三变成一爻，十八变成卦」：
                      按钮本身就叫「推进一变」，Section 的 hint 已写「十八变成卦」，
                      上方正文也写过「三变得一爻，十八变而成卦」——同一件事说三遍，删。 */}
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
      <ExplainDialog explain={explain} onClose={() => setExplain(null)} />
    </>
  )
}
