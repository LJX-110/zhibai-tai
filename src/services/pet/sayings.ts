/**
 * 桌宠「知白」说什么 —— **纯函数**（给状态，吐一句话，或 null）
 *
 * ## 与通知的分工（别混）
 * 「最近通知」是**提醒**（该你做的事，会被设置挡、需要回看）；
 * 这里的是**宠物搭话**（它看见了你的状态，嘴硬地提一句）。
 * 两套互不干扰：气泡不占用通知配额，通知也不驱动气泡。
 *
 * ## 只搭三类话（这是"独立风格"的关键）
 * ① **你的状态有变化**（功行 / 境界 / 闭关 / 逾期 / 固定未做）；
 * ② **马上要发生的事**（课前）；
 * ③ **久别或节气**（久未打开 / 节气）。
 * **不搭的三类**：通用闲聊、与数据无关的问候、没有变化也定期说话。
 *
 * ## 优先级
 * 同时满足多条时只说**最要紧**的一条 —— 气泡同时最多一条，
 * 所以这里必须给出**确定的顺序**，不能让调用方去挑。
 *
 * 文案风格：**白话短句**（单条 ≤ 14 字），人格细节见 `persona.ts`。
 */
import { PERSONA as P } from './persona'

/** 该说什么 —— `hash` 为点击后的跳转目标（无则为空串，气泡不可点） */
export interface Saying {
  /** 去抖键：同一件事的同一档位共用（如 `merit:1`） */
  key: string
  text: string
  /** 跳转目标（与全站同一套 hash） */
  hash: string
}

export interface SayingContext {
  /** 当前时刻（纯函数，便于单测确定化） */
  now: Date
  /** 今日净行（功行）增量 */
  todayMerit: number
  /** 当前境界标题 */
  realmTitle: string
  /** 境界是否**刚刚**提升（由调用方比较前后值） */
  realmJustUp: boolean
  /** 刚结束的闭关分钟数（null = 没有刚结束的闭关） */
  justSeclusionMin: number | null
  /** 今日固定任务未做条数 */
  fixedUndone: number
  /** 逾期待办条数 */
  overdue: number
  /** 下一节课（15 分钟内才传，否则传 null） */
  nextClass: { name: string; minutesLeft: number; room?: string } | null
  /** 连续未打开天数（0 = 每天都来） */
  awayDays: number
}

/** 功行档位：按档去抖 —— 数值每变一点就说话会变成骚扰 */
function meritTier(merit: number): number {
  if (merit >= 40) return 4
  if (merit >= 25) return 3
  if (merit >= 15) return 2
  if (merit >= 5) return 1
  return 0
}

/**
 * 挑一句该说的话；**没有值得说的**返回 null（这才是常态）。
 *
 * 顺序：境界 > 闭关 > 课前 > 逾期 > 久别 > 功行 > 固定未做 > 节气。
 */
export function pickSaying(ctx: SayingContext): Saying | null {
  // ① 境界刚提升：最值得说的一件事
  if (ctx.realmJustUp && ctx.realmTitle) {
    return {
      key: `realm:${ctx.realmTitle}`,
      text: `到「${ctx.realmTitle}」了，哼，一般般`,
      hash: '#/cultivate',
    }
  }

  // ② 闭关结束：它的"奖励"是嘴硬地承认你挺能熬
  if (ctx.justSeclusionMin !== null && ctx.justSeclusionMin > 0) {
    return {
      key: 'seclusion',
      text: `闭关 ${Math.round(ctx.justSeclusionMin)} 分钟，${P.master}挺能熬`,
      hash: '#/study',
    }
  }

  // ③ 马上上课：说清"还有几分钟 + 在哪"，比提醒更口语
  if (ctx.nextClass) {
    const c = ctx.nextClass
    const where = c.room ? ` · ${c.room}` : ''
    return {
      key: 'class',
      text: `${c.name}还有 ${Math.max(1, Math.round(c.minutesLeft))} 分钟${where}`,
      hash: '#/study',
    }
  }

  // ④ 逾期：嘴上催，其实是怕你忘了挨骂
  if (ctx.overdue > 0) {
    return {
      key: `overdue:${ctx.overdue}`,
      text: `${ctx.overdue} 项逾期了，${P.master}别装没看见`,
      hash: '#/action',
    }
  }

  // ⑤ 久别：这是 `TIMEOUT_SIGNAL` —— 先给个信号，不是抱怨
  if (ctx.awayDays >= 3) {
    return {
      key: 'away',
      text: `${ctx.awayDays} 天没来了，${P.self}快饿瘦了`,
      hash: '#/overview',
    }
  }

  // ⑥ 功行进账：按档位说，档位不变就不重复
  const tier = meritTier(ctx.todayMerit)
  if (tier >= 1) {
    return {
      key: `merit:${tier}`,
      text: `今天 ${ctx.todayMerit} 功了，还行吧`,
      hash: '#/cultivate',
    }
  }

  // ⑦ 今日固定还差：只在"真的还差"时提醒，否则变成唠叨
  if (ctx.fixedUndone > 0) {
    return {
      key: `fixed:${ctx.fixedUndone}`,
      text: `今天的固定还差 ${ctx.fixedUndone} 项`,
      hash: '#/action',
    }
  }

  // ⑦ 饭点：它唯一会主动提的食物（`FOOD_RICE`）。
  //    时间驱动，所以放在**最低优先级** —— 只有前面都没得说时才轮到它，
  //    再叠加 30 分钟去抖，实际一天最多两回（午/晚各一次）。
  if (isMealTime(ctx.now)) {
    return {
      key: 'meal',
      text: `${P.master}，${P.self}想吃${P.food}了`,
      hash: '',
    }
  }

  return null
}

/**
 * 饭点窗口（本地时间）：午 11:30–12:30、晚 17:30–19:00。
 *
 * 只认整段小时+分钟比较，不做"饭点前后几分钟"的模糊 ——
 * 那种模糊会让窗口变得不可预测，调频次时无从下手。
 */
export function isMealTime(now: Date): boolean {
  const m = now.getHours() * 60 + now.getMinutes()
  return (m >= 690 && m <= 750) || (m >= 1050 && m <= 1140)
}
