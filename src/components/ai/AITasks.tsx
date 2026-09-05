/**
 * AITasks —— AI 任务（术页工作台）
 * 一键运行：今日简报 / 学习计划 / 项目摘要 / 总结情报（本地规则 Provider）
 */
import { useState } from 'react'
import { Bot, CalendarDays, FileText, GraduationCap, NotebookPen } from 'lucide-react'
import { aiService } from '../../services/ai/ai-service'
import { useTodayStats } from '../../hooks/useTodayStats'
import { cultivationSources } from '../../services/cultivation'
import { useCourseStore, useExamStore, useHomeworkStore } from '../../stores/useStudyStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { useWaterStore } from '../../stores/useWaterStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { playSound } from '../../services/sound'
import { todayISO } from '../../utils/id'
import { Dialog, useToast } from '../ui'

interface AiTask {
  key: string
  label: string
  desc: string
  icon: typeof Bot
}

const TASKS: AiTask[] = [
  { key: 'brief', label: '今日简报', desc: '汇总今日完成/专注/饮水/道行', icon: CalendarDays },
  { key: 'plan', label: '学习计划', desc: '按课程/作业/考试生成建议', icon: GraduationCap },
  { key: 'project', label: '项目摘要', desc: '首个项目的进度与里程碑摘要', icon: NotebookPen },
  { key: 'intel', label: '总结情报', desc: '最近一条情报的摘要/标签/重要度', icon: FileText },
]

export function AITasks() {
  const stats = useTodayStats()
  const water = useWaterStore((s) => s.items)
  const waterGoal = useSettingsStore((s) => s.waterGoalMl)
  const courses = useCourseStore((s) => s.items)
  const homeworks = useHomeworkStore((s) => s.items)
  const exams = useExamStore((s) => s.items)
  const projects = useProjectStore((s) => s.items)
  const intel = useIntelligenceStore((s) => s.items)
  const toast = useToast().toast
  const [busy, setBusy] = useState<string | null>(null)
  const [output, setOutput] = useState<{ title: string; body: string } | null>(null)

  const run = async (key: string) => {
    setBusy(key)
    playSound('ui-open')
    try {
      let title = ''
      let body = ''
      if (key === 'brief') {
        title = '今日简报'
        const date = todayISO()
        const waterMl = water.filter((w) => w.date === date).reduce((s, w) => s + w.amountMl, 0)
        body = await aiService.dailyBrief({
          date,
          tasksDone: stats.tasksDone,
          focusMin: stats.focusMinutes,
          waterMl,
          goal: waterGoal,
          sources: cultivationSources({
            tasksDoneToday: stats.tasksDone,
            focusMinutesToday: stats.focusMinutes,
            waterRatio: stats.waterRatio,
            habitLogsToday: stats.habitLogs,
            bodyLogsToday: stats.bodyLogs,
            journalToday: Boolean(stats.journal),
            journalMood: stats.journal?.mood,
            creationsToday: stats.creations,
          }),
        })
      } else if (key === 'plan') {
        title = '学习计划'
        body = await aiService.studyPlan({
          courses: courses.map((c) => ({ name: c.name })),
          undone: homeworks.filter((h) => !h.done).length,
          exams: exams.map((e) => ({ title: e.title, date: e.date })),
        })
      } else if (key === 'project') {
        title = '项目摘要'
        const p = projects[0]
        if (!p) {
          body = '还没有项目。去「藏 · 项目中心」新建一个项目，AI 会为你生成摘要。'
        } else {
          body = await aiService.projectSummary(p)
        }
      } else {
        title = '情报摘要'
        const it = [...intel].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        if (!it) {
          body = '还没有情报。去「情」拉取一些情报后，AI 会为最新一条生成摘要与标签。'
        } else {
          const [summary, tags, rank] = await Promise.all([
            aiService.summarize(it),
            aiService.tag(it),
            aiService.rank(it),
          ])
          body = `标题：${it.title}\n摘要：${summary}\n标签：${tags.join('、')}\n重要度：${rank}`
        }
      }
      setOutput({ title, body })
      playSound('success')
    } catch {
      toast('AI 任务失败', 'danger')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-6">
      <div className="section-title text-sm">
        <span className="display flex items-center gap-1.5">
          <Bot size={14} className="text-teal" /> AI 任务
        </span>
        <span className="hint">本地规则 Provider · 一键生成</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {TASKS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => run(t.key)}
              disabled={busy != null}
              className="group flex items-center gap-3 rounded-tile border border-line bg-panel/70 px-4 py-3 text-left transition-colors hover:border-teal/40 hover:bg-teal/5 disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-raised text-ink-muted group-hover:text-teal">
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{busy === t.key ? '生成中…' : t.label}</span>
                <span className="block truncate text-[11px] text-ink-faint">{t.desc}</span>
              </span>
            </button>
          )
        })}
      </div>

      <Dialog
        open={output != null}
        onClose={() => setOutput(null)}
        title={output?.title ?? ''}
        footer={
          <button
            className="rounded-tile bg-cinnabar px-4 py-2 text-sm text-on-cinnabar"
            onClick={() => setOutput(null)}
          >
            知道了
          </button>
        }
      >
        <pre className="whitespace-pre-wrap rounded-tile border border-line bg-paper/70 p-4 font-sans text-sm leading-relaxed text-ink-soft">
          {output?.body}
        </pre>
      </Dialog>
    </div>
  )
}
