/**
 * StudyAssistant —— 学页 AI 学习助手
 * 输入目标（如「准备数据结构考试」）→ 生成学习计划预览 → 用户确认后 存为笔记 / 生成为任务
 * 原则：AI 只生成建议，写入前必须预览确认
 */
import { useState } from 'react'
import { Bot, BookOpen, Check, ListPlus, StickyNote } from 'lucide-react'
import { aiService } from '../../services/ai/ai-service'
import { useCourseStore, useExamStore, useHomeworkStore } from '../../stores/useStudyStore'
import { useNoteStore } from '../../stores/useNoteStore'
import { useTaskStore } from '../../stores/useTaskStore'
import { playSound } from '../../services/sound'
import { createId } from '../../utils/id'
import { Button, Dialog, Input, useToast } from '../ui'

export function StudyAssistant() {
  const courses = useCourseStore((s) => s.items)
  const homeworks = useHomeworkStore((s) => s.items)
  const exams = useExamStore((s) => s.items)
  const toast = useToast().toast
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const generate = async () => {
    if (!goal.trim()) return
    setBusy(true)
    playSound('ui-open')
    try {
      const text = await aiService.studyPlan({
        courses: courses.map((c) => ({ name: c.name })),
        undone: homeworks.filter((h) => !h.done).length,
        exams: exams.map((e) => ({ title: e.title, date: e.date })),
        goal: goal.trim(),
      })
      setResult(text)
      playSound('success')
    } catch {
      toast('生成失败', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const saveAsNote = async () => {
    if (!result) return
    const now = new Date().toISOString()
    await useNoteStore.getState().add({
      id: createId(),
      kind: 'note',
      title: `学习计划 · ${goal.trim()}`,
      body: result,
      tags: ['学习', 'AI'],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    })
    playSound('seal')
    toast('已存为笔记 → 行 · 记事本', 'success')
    setResult(null)
    setGoal('')
  }

  const saveAsTask = async () => {
    if (!result) return
    const now = new Date().toISOString()
    await useTaskStore.getState().add({
      id: createId(),
      title: goal.trim(),
      description: result,
      done: false,
      priority: 'mid',
      dueDate: null,
      tags: ['学习', 'AI'],
      repeat: 'none',
      projectId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    playSound('seal')
    toast('已生成为任务 → 行', 'success')
    setResult(null)
    setGoal('')
  }

  return (
    <div className="mt-6">
      <div className="section-title text-sm">
        <span className="display flex items-center gap-1.5">
          <Bot size={14} className="text-teal" /> AI 学习助手
        </span>
        <span className="hint">输入目标，生成学习计划（预览后确认写入）</span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="如：准备数据结构考试 / 期末复习高数"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            className="!pl-9"
          />
        </div>
        <Button variant="primary" onClick={generate} disabled={busy || !goal.trim()}>
          {busy ? '生成中…' : '生成计划'}
        </Button>
      </div>

      <Dialog
        open={result != null}
        onClose={() => setResult(null)}
        title="学习计划 · 预览"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setResult(null)}>取消</Button>
            <Button variant="secondary" onClick={saveAsNote}>
              <StickyNote size={13} /> 存为笔记
            </Button>
            <Button variant="primary" onClick={saveAsTask}>
              <ListPlus size={13} /> 生成为任务
            </Button>
          </>
        }
      >
        <pre className="whitespace-pre-wrap rounded-tile border border-line bg-paper/70 p-4 font-sans text-sm leading-relaxed text-ink-soft">
          {result}
        </pre>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-faint">
          <Check size={11} /> 写入前请确认：AI 仅生成建议，可自由修改。
        </p>
      </Dialog>
    </div>
  )
}
