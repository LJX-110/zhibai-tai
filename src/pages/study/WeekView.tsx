/**
 * 学 · 周景（从 TimetableTab 抽出，见 `编码规范` §7.1「按区域重构」）
 *
 * 抽出理由：加"单次停课"标记后 `TimetableTab.tsx` 涨到 427 行，超了单文件 400 行的硬限。
 * 周景这块**本身就是一段完整区域**（桌面横向立轴 + 移动端每日行列表两套渲染），
 * 且它需要的全部外部信息都能显式传参 —— 是标准的可抽单元。
 *
 * 抽的时候守了 §7.1 的两条：
 *  · **子组件显式传参**，不隔着文件读 store（除了 `useInspectorStore` 这个全局单例，
 *    它与本项目其它详情入口用法一致）；
 *  · 它用到的辅助函数（`courseLabel` / `barFor` / `colorFor` / `WEEKDAY_NAMES`）**不在本文件重定义**，
 *    统一从 `./shared` 引 —— 绝不隔着文件引用，也绝不各写一份。
 *
 * ⚠️ **已停 / 已调走的课要显示、不要隐藏**（划掉 + 变淡 + 灰条）：
 * 直接隐藏会让人以为课表丢了，而用户真正会问的是"这周那节课到底还上不上"。
 * 调**来**的课则要补进目标那天的格子里（打「调课」标），否则用户只知道"那节没了"。
 */
import { Plus } from 'lucide-react'
import { useInspectorStore } from '../../components/inspector/inspector-store'
import { dateOfWeekday, daySlotsDetailed, describeWeeks } from '../../services/study'
import type { Course, CourseCancellation, CourseReschedule } from '../../types/entities'
import { cn } from '../../utils/cn'
import { WEEKDAY_NAMES, barFor, colorFor, courseLabel } from './shared'

export interface WeekViewProps {
  courses: Course[]
  cancellations: CourseCancellation[]
  /** 单次调课记录（与停课同源：调走的剔除、调来的补上） */
  reschedules: CourseReschedule[]
  /** 当前周次（null = 未设学期首周，此时不做停课/调课判断） */
  week: number | null
  termStartDate?: string
  /** 今天（0-6，0=周日） */
  today: number
  focusedDay: number | null
  onFocusDay: (wd: number) => void
  onQuickAdd: (weekday: number) => void
}

export function WeekView({
  courses,
  cancellations,
  reschedules,
  week,
  termStartDate,
  today,
  focusedDay,
  onFocusDay,
  onQuickAdd,
}: WeekViewProps) {
  /** 一天的课（带「已停 / 调走 / 调来」标记）。每格都要按自己的日期判断，故逐格算。 */
  const slotsOf = (wd: number) =>
    daySlotsDetailed(courses, wd, week, dateOfWeekday(termStartDate, week, wd), cancellations, reschedules)

  return (
    <>
      {/* 桌面：立轴周景横滚（每日一根轴），移动端隐藏 */}
      <div className="scrollbar-thin hidden overflow-x-auto pb-1 sm:block">
        <div className="flex min-w-[660px] gap-2.5">
          {WEEKDAY_NAMES.map((name, wd) => {
            const isToday = wd === today
            const daySlots = slotsOf(wd)
            return (
              <div
                key={wd}
                className={cn(
                  'flex min-w-[86px] flex-1 flex-col rounded-tile border p-2 text-left transition-colors',
                  isToday
                    ? 'border-cinnabar/60 bg-cinnabar/[0.09]'
                    : focusedDay === wd
                      ? 'border-cinnabar/50 bg-cinnabar/[0.08]'
                      : 'border-teal/40 bg-teal/[0.08]',
                )}
              >
                <button
                  type="button"
                  onClick={() => onFocusDay(wd)}
                  className={cn(
                    'mb-2 text-center text-xs',
                    isToday || focusedDay === wd ? 'font-medium text-gold-btn' : 'text-ink-faint',
                  )}
                >
                  {name}
                  {isToday && ' · 今'}
                </button>
                <div className="flex flex-1 flex-col items-center gap-2.5">
                  {daySlots.map(({ course, slot, canceled, movedTo, movedIn }) => {
                    const off = canceled || Boolean(movedTo)
                    return (
                    <button
                      key={`${course.id}-${slot.start}-${(slot.weeks ?? []).join('.')}-${movedIn ? 'in' : ''}`}
                      onClick={() => useInspectorStore.getState().open('course', course.id)}
                      className={cn(
                        // 与手机端同一套配色语言：**实色标记承载"哪门课"，底色保持中性克制**。
                        // 此前这里用 colorFor 的 10% 淡底：那点透明度摊在整块竖格上会整块发灰，
                        // 既显脏，又与"今日/选中"的 cinnabar 淡底分不开（手机端是小胶囊，看不出来）。
                        // 圆角也从 sheet(16px) 收到 tile(8px)：这是信息格，不是卡片。
                        'relative flex w-full flex-col items-center gap-2 overflow-hidden rounded-tile border border-line bg-raised px-1.5 py-3.5 transition-transform hover:-translate-y-px',
                        // 已停 / 已调走的课留在格子里（划掉+变淡），不隐藏；调来的正常显色
                        off && 'opacity-55',
                        movedIn && 'border-teal/50',
                      )}
                      title={`${canceled ? '已停课 · ' : movedTo ? `调至 ${movedTo.toDate} ${movedTo.toStart} · ` : movedIn ? '调课补入 · ' : ''}${slot.start}–${slot.end}${slot.weeks && slot.weeks.length > 0 ? ` · ${describeWeeks(slot.weeks)}` : ''}`}
                    >
                      {/* 左侧实色条 = 手机端那枚实心圆点的竖排等价物（同一 barFor 取色） */}
                      <span
                        className={cn(
                          'absolute inset-y-1.5 left-0 w-[3px] rounded-full',
                          off ? 'bg-line-strong' : barFor(course.id),
                        )}
                      />
                      {/* 竖排课名格（7 列窄格 + max-h-[110px] + overflow-hidden） */}
                      <span
                        className={cn(
                          // 字号例外：竖排窄格放不到 text-sm —— 一列能容纳的字数会变少，
                          // 长课名被 overflow-hidden 直接裁掉半句，宁可保持 13px
                          'vertical-slip max-h-[110px] overflow-hidden text-[13px] font-medium leading-none',
                          off && 'text-ink-faint line-through',
                        )}
                      >
                        {courseLabel(course)}
                      </span>
                      <span className="tabular text-xs text-ink-faint">{slot.start}</span>
                    </button>
                    )
                  })}
                  {/* 空位即入口：在此日的格子里直接加课 */}
                  <button
                    onClick={() => onQuickAdd(wd)}
                    className="flex w-full flex-1 items-center justify-center rounded-paper border border-dashed border-line-strong/60 py-3 text-ink-faint transition-colors hover:border-cinnabar/40 hover:text-cinnabar"
                    aria-label={`在 ${name} 加课`}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 移动端：横向滚动不友好，改为每日行列表 */}
      <div className="space-y-2 sm:hidden">
        {WEEKDAY_NAMES.map((name, wd) => {
          const isToday = wd === today
          const daySlots = slotsOf(wd)
          return (
            <div
              key={wd}
              className={cn(
                'rounded-tile border p-3 transition-colors',
                isToday || focusedDay === wd ? 'border-cinnabar/50 bg-cinnabar/[0.07]' : 'border-line bg-paper',
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onFocusDay(wd)}
                  className={cn(
                    'text-sm',
                    isToday || focusedDay === wd ? 'font-medium text-gold-btn' : 'text-ink',
                  )}
                >
                  {name}
                  {isToday && ' · 今'}
                </button>
                <button
                  onClick={() => onQuickAdd(wd)}
                  className="flex items-center gap-0.5 rounded-control bg-nested px-1.5 py-0.5 text-xs text-ink-faint transition-colors hover:text-cinnabar"
                  aria-label={`在 ${name} 加课`}
                >
                  <Plus size={11} /> 加课
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {daySlots.length === 0 && <span className="text-xs text-ink-faint">无课</span>}
                {daySlots.map(({ course, slot, canceled, movedTo, movedIn }) => {
                  const off = canceled || Boolean(movedTo)
                  return (
                  <button
                    key={`${course.id}-${slot.start}-${(slot.weeks ?? []).join('.')}-${movedIn ? 'in' : ''}`}
                    onClick={() => useInspectorStore.getState().open('course', course.id)}
                    title={canceled ? '已停课' : movedTo ? `调至 ${movedTo.toDate} ${movedTo.toStart}` : movedIn ? '调课补入' : undefined}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-control border px-2 py-1 text-xs transition-colors',
                      // 已停 / 已调走的课不用课程识别色（否则看起来和正常课一样），改中性底 + 划掉；
                      // 调来的课正常显色，只额外加一枚「调课」小字
                      off ? 'border-line bg-raised text-ink-faint' : colorFor(course.id),
                    )}
                  >
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', off ? 'bg-line-strong' : barFor(course.id))}
                    />
                    <span className={cn('max-w-[9rem] truncate', off && 'line-through')}>
                      {courseLabel(course)}
                    </span>
                    <span className="tabular text-xs opacity-75">{slot.start}</span>
                    {/* 字号例外：胶囊本身只有 11px，调课标记再大就把课名挤到截断（同 WeekView 的 13px 例外理由） */}
                    {movedIn && <span className="shrink-0 text-[10px] tracking-label">调课</span>}
                  </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
