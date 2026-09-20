/**
 * 奇 · 抽签页签（今日签 + 常用工具）
 * 状态自持（状态跟着页签走，与设置页分组的拆法一致），对外零 props。
 */
import { useState } from 'react'
import { ScrollText, Sparkles } from 'lucide-react'
import { useDivinationStore, saveDailySignRecord } from '../../stores/useDivinationStore'
import { signOf } from '../../services/divination'
import { aiService } from '../../services/ai/ai-service'
import { useTodayStats } from '../../hooks/useTodayStats'
import { recordActivity } from '../../services/activity'
import { Seal } from '../../components/ui/Seal'
import { Button, Section, useToast } from '../../components/ui'
import { todayISO } from '../../utils/id'
import { BaguaWheel, ToolTile } from './Widgets'

export function SignTab() {
  const today = todayISO()
  const sign = signOf(today)
  const toast = useToast().toast
  const records = useDivinationStore((s) => s.items)
  const stats = useTodayStats()
  const [reading, setReading] = useState(false)

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

  return (
    <>
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
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

      {/* 常用工具：两枚快捷入口（与「今日签」同属「抽签」场景） */}
      <div className="mt-2">
        <Section title="常用工具">
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
    </>
  )
}
