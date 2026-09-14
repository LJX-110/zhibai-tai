/**
 * 上课提醒 —— 全局挂载（不依赖是否停在「学」页）
 *
 * 每分钟检查一次即将开始的课（默认提前 15 分钟）；同一节课当天只提示一次，
 * 避免每分钟重复刷屏。开关跟随设置里的「轻量通知」，
 * 开启了浏览器通知时同步推一条系统通知（切到后台也能收到）。
 */
import { useEffect } from 'react'
import { useCourseStore } from '../../stores/useStudyStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useToastStore } from '../ui/Toast'
import { browserNotify } from '../../services/notification'
import { currentWeek, upcomingClasses } from '../../services/study'
import { todayISO } from '../../utils/id'

/** 提前提醒的分钟数 */
const AHEAD_MIN = 15
/** 已提醒标记：`课程id|日期|开始时间`，当天内不重复 */
const reminded = new Set<string>()

export function ClassReminder() {
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)

  useEffect(() => {
    if (!notifyEnabled) return
    const tick = () => {
      const now = new Date()
      // 取值一律现读：课程/学期起始日改了不必重建定时器，下一次 tick 自会跟上
      const week = currentWeek(useSettingsStore.getState().termStartDate)
      const list = upcomingClasses(
        useCourseStore.getState().items,
        now.getDay(),
        week,
        now.getHours() * 60 + now.getMinutes(),
        AHEAD_MIN,
      )
      for (const { course, slot, minutesLeft } of list) {
        const key = `${course.id}|${todayISO()}|${slot.start}`
        if (reminded.has(key)) continue
        reminded.add(key)
        const when = minutesLeft <= 0 ? '即将开始' : `${minutesLeft} 分钟后`
        const where = course.room ? ` · ${course.room}` : ''
        useToastStore.getState().push(`${course.name} ${when}（${slot.start}${where}）`, 'info')
        if (useSettingsStore.getState().browserNotify) {
          void browserNotify(`即将上课：${course.name}`, `${slot.start} 开始${where}`)
        }
      }
    }
    tick()
    const timer = window.setInterval(tick, 60_000)
    return () => window.clearInterval(timer)
  }, [notifyEnabled])

  return null
}
