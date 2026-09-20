/**
 * 行 —— 践行（今日 · 待办 · 日历 · 记事本）
 * 待办简化为「未完成清单 + 每月/每周固定提醒」，每月 N 号 / 每周 X 固定提醒（如 27 号交话费、每周三复盘）；
 * 保数据、保功能，只清结构。
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：三个页签与共用的 useTaskEditor 各自成文件
 * 放在 ./action/ 下；本文件只留页头 + 页签切换 + 一个 tab 状态。
 */
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '../components/ui'
import { TodoTab } from './action/TodoTab'
import { CalendarTab } from './action/CalendarTab'
import { NotesTab } from './action/NotesTab'

const TABS: TabItem[] = [
  { key: 'todo', label: '待办' },
  { key: 'calendar', label: '日历' },
  { key: 'notes', label: '记事本' },
]

export function ActionPage() {
  const [tab, setTab] = useState('todo')
  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="千里之行，始于足下" title="行 · 践行" />
      <Tabs items={TABS} active={tab} onChange={setTab} className="mb-4" />
      {tab === 'todo' && <TodoTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'notes' && <NotesTab />}
    </div>
  )
}
