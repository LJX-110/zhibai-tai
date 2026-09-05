/**
 * FocusMode —— 桌面专注模式
 * 隐藏侧栏与无关数据，只留：当前任务 / 番茄钟 / 时间 / 退出
 */
import { useEffect, useState } from 'react'
import { Check, Pause, Play, X } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { usePomodoroTimerStore } from '../../stores/usePomodoroTimerStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { recordActivity } from '../../services/activity'
import { playSound } from '../../services/sound'
import { Seal } from '../ui/Seal'
import { Button } from '../ui/Button'
import { todayISO } from '../../utils/id'
import { cn } from '../../utils/cn'

export function FocusMode() {
  const focusMode = useAppStore((s) => s.focusMode)
  const setFocusMode = useAppStore((s) => s.setFocusMode)
  const tasks = useTaskStore((s) => s.items)
  const focusMin = useSettingsStore((s) => s.pomodoroFocusMin)
  // 全局番茄钟（与学页/顶栏共用）
  const timer = usePomodoroTimerStore()
  const { running, seconds } = timer
  const [now, setNow] = useState(new Date())

  // 当前专注任务：未完成，优先级高→中
  const current = tasks
    .filter((t) => !t.done)
    .sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || a.createdAt.localeCompare(b.createdAt))[0]

  // 每秒刷新时间
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (!focusMode) return null

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const pm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ps = String(seconds % 60).padStart(2, '0')

  const completeTask = async () => {
    if (!current) return
    await useTaskStore.getState().update(current.id, {
      done: true,
      completedAt: new Date().toISOString(),
    })
    playSound('seal')
    void recordActivity({ entityType: 'task', entityId: current.id, title: `完成任务：${current.title.slice(0, 24)}` })
  }

  const startPomo = () => {
    // 专注默认关联当前任务（全局计时）
    timer.setAssoc(current ? 'task' : 'none', current?.id ?? '')
    timer.start()
    playSound('ui-confirm')
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-paper">
      {/* 顶栏：退出 */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 text-xs tracking-[0.3em] text-ink-faint">
          <Seal size={20} char="异" /> FOCUS · 专注
        </div>
        <Button size="sm" variant="tertiary" onClick={() => setFocusMode(false)}>
          <X size={14} /> 退出专注
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6">
        {/* 时间（Primary） */}
        <div className="text-center">
          <div className="display-hero num-tabular font-semibold text-ink-bright">
            {hh}:{mm}
          </div>
          <div className="mt-1 text-xs tracking-[0.4em] text-ink-faint">
            {todayISO()} · 心无旁骛
          </div>
        </div>

        {/* 当前任务 */}
        <div className="w-full max-w-md rounded-paper border border-line bg-panel px-6 py-5 text-center">
          <div className="mb-2 text-[11px] tracking-[0.3em] text-ink-faint">当前任务 · NOW</div>
          {current ? (
            <>
              <div className="display text-xl font-semibold text-ink">{current.title}</div>
              <Button className="mt-4" variant="ritual" onClick={completeTask}>
                <Check size={14} /> 完成此任务
              </Button>
            </>
          ) : (
            <div className="text-sm text-ink-muted">暂无未完成任务，享受此刻。</div>
          )}
        </div>

        {/* 番茄钟 */}
        <div className="text-center">
          <div className={cn('num-tabular text-6xl font-semibold', running ? 'text-cinnabar' : 'text-ink')}>
            {pm}:{ps}
          </div>
          <div className="mt-1 text-[11px] tracking-[0.3em] text-ink-faint">番茄钟 · {focusMin} 分钟</div>
          <div className="mt-4 flex justify-center gap-2">
            {running ? (
              <Button variant="secondary" onClick={() => { timer.pause(); playSound('ui-close') }}>
                <Pause size={14} /> 暂停
              </Button>
            ) : (
              <Button variant="primary" onClick={startPomo}>
                <Play size={14} /> 开始
              </Button>
            )}
            <Button variant="tertiary" onClick={() => { timer.reset(); playSound('ui-close') }}>
              重置
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
