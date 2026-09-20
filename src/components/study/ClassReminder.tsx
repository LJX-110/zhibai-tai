/**
 * 上课提醒 —— 全局挂载（不依赖是否停在「学」页）
 *
 * 每分钟检查一次即将开始的课（默认提前 15 分钟）；同一节课当天只提示一次。
 * 去重记录落本地，刷新/重开不会重播；回到前台时补一次检查，
 * 避免页面休眠跨过提醒窗口后这节课被永久漏掉。
 * 开关跟随设置里的「轻量通知」；另开系统通知时同步推一条（需已授权）。
 * 应用被完全关闭时无法提醒 —— 这是纯前端 PWA 的固有边界，不做假装。
 */
import { useEffect } from 'react'
import { useCourseStore } from '../../stores/useStudyStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useToastStore } from '../ui/Toast'
import { browserNotify, claimDailyNotice, isQuietNow, recordNotice } from '../../services/notification'
import { currentWeek, upcomingClasses } from '../../services/study'
import { todayISO } from '../../utils/id'

/** 提前提醒的分钟数 */
const AHEAD_MIN = 15

export function ClassReminder() {
  const notifyEnabled = useSettingsStore((s) => s.notifyEnabled)

  useEffect(() => {
    if (!notifyEnabled) return
    const tick = () => {
      const now = new Date()
      const today = todayISO()
      // 取值一律现读：课程/学期起始日改了不必重建定时器，下一次 tick 自会跟上
      const week = currentWeek(useSettingsStore.getState().termStartDate)
      const list = upcomingClasses(
        useCourseStore.getState().items,
        now.getDay(),
        week,
        now.getHours() * 60 + now.getMinutes(),
        AHEAD_MIN,
      ).filter(
        // 未设置「学期起始日」时 week 为 null，带周次（单双周）的课无从判断该不该上 ——
        // 宁可漏报也不错报（用户反馈过「这周不上却仍提醒」）；设置起始日后自动恢复完整提醒
        ({ slot }) => week != null || !slot.weeks || slot.weeks.length === 0,
      )
      const st = useSettingsStore.getState()
      // 免打扰时段：只记入历史，不弹提示、不发系统通知
      const quiet = st.quietEnabled && isQuietNow(st.quietFrom, st.quietTo, now)
      for (const { course, slot, minutesLeft } of list) {
        // 去重键含日期与开始时间：同一节课当天只提醒一次，跨日自动失效
        if (!claimDailyNotice(`class:${course.id}:${slot.start}`, today)) continue
        const when = minutesLeft <= 0 ? '即将开始' : `${minutesLeft} 分钟后`
        const where = course.room ? ` · ${course.room}` : ''
        const text = `${course.name} ${when}（${slot.start}${where}）`
        if (quiet) {
          recordNotice(text, '#/study')
          continue
        }
        useToastStore.getState().push(text, 'info', '#/study')
        if (st.browserNotify) {
          void browserNotify(`即将上课：${course.name}`, `${slot.start} 开始${where}`, '#/study')
        }
      }
    }
    tick()
    const timer = window.setInterval(tick, 60_000)
    // 长时间挂在后台时定时器会被节流甚至暂停，回到前台补一次检查，
    // 否则 07:45 → 08:10 这种跨过提前窗口的情况会永久漏提醒
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [notifyEnabled])

  return null
}
