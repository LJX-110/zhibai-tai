/**
 * 学 —— 番茄钟 / 课程 / 作业 / 考试（外壳）
 *
 * 只负责页头、页签与分发；各 Tab 与其共享常量独立在 `./study/` 下
 * （原先 1272 行、五个 Tab 函数全堆在一个文件里）。
 */
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '../components/ui'
import { CourseTab } from './study/CourseTab'
import { ExamTab } from './study/ExamTab'
import { HomeworkTab } from './study/HomeworkTab'
import { PomodoroTab } from './study/PomodoroTab'
import { TimetableTab } from './study/TimetableTab'

const TABS: TabItem[] = [
  { key: 'timetable', label: '课程表' },
  { key: 'focus', label: '专注' },
  { key: 'homework', label: '作业' },
  { key: 'exam', label: '考试' },
]

export function StudyPage() {
  const [tab, setTab] = useState('timetable')
  /** 课程表页签内的子视图：表格 / 课程管理（原「课程」页签不再是独立页签） */
  const [managingCourses, setManagingCourses] = useState(false)
  /** 课表空格子快速加课：带上周几与一次性 nonce，切到课程管理并直接开编辑器 */
  const [quickAdd, setQuickAdd] = useState<{ weekday: number; nonce: number } | null>(null)
  const openQuickAdd = (weekday: number) => {
    setQuickAdd({ weekday, nonce: Date.now() })
    setManagingCourses(true)
  }
  return (
    <div className="relative mx-auto max-w-[var(--content-max-w)]">
      <PageHeader poem="学而时习之，不亦说乎" title="学 · 进境" />
      <Tabs
        items={TABS}
        active={tab}
        onChange={(k) => {
          setTab(k)
          // 离开课程表页签时复位子视图，回来看到的是课表本身而不是管理页
          if (k !== 'timetable') setManagingCourses(false)
        }}
        className="mb-4"
      />
      
      {tab === 'timetable' &&
        (managingCourses ? (
          <CourseTab quickAdd={quickAdd} onBack={() => setManagingCourses(false)} />
        ) : (
          <TimetableTab onGoCourse={() => setManagingCourses(true)} onQuickAdd={openQuickAdd} />
        ))}
      {tab === 'focus' && <PomodoroTab />}
      {tab === 'homework' && <HomeworkTab />}
      {tab === 'exam' && <ExamTab />}
    </div>
  )
}
