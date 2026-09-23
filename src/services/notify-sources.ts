/**
 * 通知「源」—— **每源开关**的粒度定义（投递管线与设置界面共用同一份清单）
 *
 * ## 为什么需要"源"这一层
 * 此前只有一个总开关 `notifyEnabled`：想不要"喝水提醒"就只能把**全部**提醒关掉。
 * 而实际上用户的心智是分得开的 —— "上课要提醒、喝水别烦我"是最常见的组合。
 * 于是把提醒按**来源**归类，每类一个开关；开关状态见 `settings.notifySources`。
 *
 * ## 粒度怎么定的（不是随手切）
 * 一条源 = **一类会一起被想要/一起被嫌弃的事**：
 *  · 课程与考试分开（上课是每天的事，考试是偶尔的大事，想关的动机完全不同）；
 *  · 作业与考试合为「学业」（都是"学业上的截止日"）；
 *  · 习惯与喝水合为「身体」（都是自我照料类，且门槛都是晚上 21:00）；
 *  · 待办与固定任务合为「待办」（都是清单上的事）。
 * 粒度再细会变成一堆开关没人看，再粗就退化成现在的总开关。
 *
 * ⚠️ **每源开关是设备级偏好，不进同步白名单**（与免打扰时段同类）：
 * 它是个对象，而快照是行级 LWW —— 两台设备各关一项会互相覆盖，
 * 最后变成"我明明关过它怎么又开了"。总开关（`notifyEnabled`）与浏览器通知
 * （`browserNotify`）才是所有设备都该遵守的，那两个已在白名单里。
 */
import type { ReminderKind } from './reminders'

export type NotifySource = 'task' | 'class' | 'study' | 'health' | 'intel' | 'sync' | 'other'

/**
 * 通知历史里的来源标记 —— 比 `NotifySource` 多一个 `'app'`：
 * **操作回执**（"待办已保存""已同步"）不是提醒，但也走同一条 toast 通路，
 * 不加这个标记的话它们会混进提醒历史里，让"最近通知"变成操作日志。
 */
export type NoticeSourceKey = NotifySource | 'app'

export interface NotifySourceMeta {
  key: NotifySource
  label: string
  desc: string
  /** 这一类包含哪些提醒（设置界面直接展示，避免"关了以后不知道影响了什么"） */
  detail: string
}

/** 展示顺序 = 设置界面的排列顺序（越常用的越靠前） */
export const NOTIFY_SOURCES: readonly NotifySourceMeta[] = [
  { key: 'task', label: '待办与固定', desc: '到期、逾期、每日/每周/每月固定', detail: '待办提醒 · 今日固定' },
  { key: 'class', label: '上课', desc: '临近上课与当日课表概览', detail: '即将上课 · 课程概览' },
  { key: 'study', label: '学业', desc: '作业与考试', detail: '作业提醒 · 考试提醒' },
  { key: 'health', label: '身体', desc: '习惯与喝水（晚间门槛）', detail: '习惯提醒 · 喝水提醒' },
  { key: 'intel', label: '关注更新', desc: '关注的关键词有新情报', detail: '关注更新' },
  { key: 'sync', label: '同步异常', desc: '同步失败与待处理冲突', detail: '同步失败 · 同步冲突' },
  { key: 'other', label: '其他', desc: '取件等一次性提醒', detail: '取件提醒' },
]

const ALL_SOURCES: readonly NotifySource[] = NOTIFY_SOURCES.map((s) => s.key)

/** 提醒种类 → 归属源。**新增 `ReminderKind` 时这里必须补**，否则编译期就会红（穷举映射） */
const KIND_TO_SOURCE: Record<ReminderKind, NotifySource> = {
  tasks: 'task',
  fixed: 'task',
  'class-ahead': 'class',
  classes: 'class',
  homeworks: 'study',
  exams: 'study',
  habits: 'health',
  water: 'health',
}

export function sourceOfReminderKind(kind: ReminderKind): NotifySource {
  return KIND_TO_SOURCE[kind]
}

/** 该源当前是否开启（**缺省视为开** —— 新源的默认行为必须是"照常提醒"，不能静默变哑） */
export function isNotifySourceOn(
  map: Partial<Record<NotifySource, boolean>> | undefined,
  source: NotifySource,
): boolean {
  const v = map?.[source]
  return v === undefined ? true : v
}

/** 是否有任意源被关掉（设置界面据此显示「已自定义」） */
export function hasCustomNotifySources(
  map: Partial<Record<NotifySource, boolean>> | undefined,
): boolean {
  return ALL_SOURCES.some((s) => map?.[s] === false)
}
