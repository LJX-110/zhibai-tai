/**
 * 完成反馈（Completion Feedback）—— **完成事件 + 反馈策略**
 *
 * ## 问题（Step 5-2C · D 批）
 * 「做成一件事」的反馈原本由各模块自己决定：
 *   · 待办：`useTaskActions` 里直接 `playSound('task-done')` + `toast('完成待办 · 功行有进')`
 *   · 作业：`HomeworkTab` 里直接 `playSound('seal')` + 自己那套 720ms 落印动画（`stampId`）
 *   · 番茄 / 习惯：各处再写一遍
 * 于是同一件事"完成感"不一致，而且**想统一加一句反馈、减一次提示，得改四个地方**。
 *
 * ## 做法
 *   完成动作 → `CompletionEvent` → `decideFeedback()`（纯函数）→ `FeedbackPlan`
 *   再由 `emitCompletion()` 按 plan 执行（音效立即播；Toast 交给调用方自己的 toast 句柄）。
 *
 * ## 三条硬规则（防"到处都在动"）
 *  1. **不是所有完成都同时触发全部反馈**：`light` 只落印、不发声不弹条；
 *     `normal` 落印 + 声；只有 `important` 才额外弹条。
 *  2. **取消勾选不产生事件**（调用方负责只在"未完成 → 完成"这一瞬发）。
 *  3. 本模块**不引入新依赖、不新增业务表、不写库**：事件是过程量，不持久化，
 *     所以**不参与同步、不进备份**（不受 §18 口径影响）。
 *
 * ⚠️ 规格里的「重要完成 → Pet celebrate」**本轮未接**：celebrate 需要一个"让桌宠庆祝一下"的
 * 触发通道，而现有 `PetState` 是由 `AgentStatus` 派生的语义状态，硬接就等于**新增宠物状态/通道**，
 * 与"不增加 Pet 状态"的约束冲突 ⇒ 记为待拍板事项，不在本模块里偷偷实现。
 */
import { playSound, type SoundEvent } from './sound'

/** 完成来源（= 业务入口，不是数据表） */
export type CompletionSource = 'task' | 'homework' | 'pomodoro' | 'habit'

/** 完成事件：字段集固定为这四项（+ 可选权重线索） */
export interface CompletionEvent {
  source: CompletionSource
  /** 数据表名（如 `tasks`），便于将来按实体做差异化 */
  entityType: string
  entityId: string
  /** ISO 时间串 —— 由调用方注入，本模块保持纯函数、可确定化单测 */
  completedAt: string
  /** 影响等级的可选线索：任务优先级 / 专注时长档 */
  weight?: 'low' | 'mid' | 'high'
}

/** 反馈档位 */
export type FeedbackLevel = 'light' | 'normal' | 'important'

export interface FeedbackPlan {
  level: FeedbackLevel
  /** 是否落印（由调用方已有的印记/勾选反馈承担；这里只表达"该有"） */
  seal: boolean
  /** 播哪个音；`null` = 这一档不发声（避免"完成喝水也叮一声"） */
  audio: SoundEvent | null
  /** 弹什么条；`null` = 不弹（只有重要完成才弹，防"多个 Toast 叠着盖内容"） */
  toast: string | null
}

/** 各来源的默认档位（没给 weight 时用） */
const DEFAULT_LEVEL: Record<CompletionSource, FeedbackLevel> = {
  task: 'normal',
  homework: 'normal',
  pomodoro: 'normal',
  habit: 'light',
}

/**
 * 纯函数：**唯一决定"这次完成该有什么反馈"的地方**。
 *
 * 档位判据（可读、可测、不依赖时间与随机）：
 *  · `weight === 'high'` → `important`（高优先级待办 / 长时间专注）
 *  · `weight === 'low'`  → 降一档（普通 → light；light 保持 light）
 *  · 其余按来源默认档
 */
export function decideFeedback(e: CompletionEvent): FeedbackPlan {
  const base = DEFAULT_LEVEL[e.source]
  let level: FeedbackLevel = base
  if (e.weight === 'high') level = 'important'
  else if (e.weight === 'low') level = base === 'normal' ? 'light' : base

  return {
    level,
    seal: true,
    // light 不发声：完成喝水、打卡这类高频轻动作，一声一响会变成噪音
    audio: level === 'light' ? null : 'task-done',
    // 只有 important 弹条：普通完成靠"落印 + 声音"已经足够，弹条会盖住内容
    toast: level === 'important' ? importantToast(e) : null,
  }
}

function importantToast(e: CompletionEvent): string {
  switch (e.source) {
    case 'task':
      return '完成待办 · 功行有进'
    case 'homework':
      return '作业已交 · 落印'
    case 'pomodoro':
      return '专注结束 · 收工'
    case 'habit':
      return '今日打卡 · 记一笔'
  }
}

/** 完成事件的订阅者（视图侧用，如桌宠"重要完成 → 庆祝一下"） */
type CompletionListener = (plan: FeedbackPlan, event: CompletionEvent) => void
const listeners = new Set<CompletionListener>()

/**
 * 订阅完成事件。
 *
 * 为什么用订阅而不是让本模块去写宠物 store：**服务层不该反向驱动业务状态**。
 * 服务只负责"宣布发生了一次完成 + 该用什么反馈"，谁来表现（桌宠、Toast、动画）
 * 由视图自己订阅决定 —— 于是 D-4 的庆祝通道不需要给任何 store 加字段。
 *
 * @returns 退订函数（在 effect 清理里调用）
 */
export function onCompletion(fn: CompletionListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * 执行反馈：**唯一出口**。
 *
 * Toast 不在这里直接弹 —— 它需要 React 侧的句柄（`useToast()`），
 * 所以由调用方通过 `notify` 注入。**缺省时静默跳过 Toast 但不报错**
 * （音效与落印已经发生，不该因为少传一个回调就中断完成动作）。
 *
 * @returns 本次实际采用的 plan（便于测试与调试）
 */
export function emitCompletion(
  e: CompletionEvent,
  notify?: (message: string, tone: 'success') => void,
): FeedbackPlan {
  const plan = decideFeedback(e)
  if (plan.audio) playSound(plan.audio)
  if (plan.toast && notify) notify(plan.toast, 'success')
  for (const fn of listeners) fn(plan, e)
  return plan
}
