/**
 * 桌宠搭话（P4）+ 好感度（P5）
 *
 * 重点不是"会不会说话"，而是这四条：
 *  · **优先级确定** —— 同时满足多条时只说最要紧的（气泡同时只能有一条）；
 *  · **没有变化就不说** —— 常态是 null，这比"说什么"更要紧；
 *  · **按档去抖** —— 功行每涨一点就冒泡是骚扰，所以功行按档位给 key；
 *  · **好感度只升不降、每日有上限** —— 上限让"连点刷分"没有意义。
 *
 * 人格相关的断言（只用中文、单条 ≤14 字、不许说胖）也在这里钉住 ——
 * 人格是最容易被后来的"顺手改一句"稀释掉的东西。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { isMealTime, pickSaying, type SayingContext } from '../services/pet/sayings'
import { PERSONA, PERSONA_TRAITS, refuseFatTalk } from '../services/pet/persona'
import { affinityGain, daysTogether, milestoneGain, milestoneDaysReached } from '../services/pet/affinity'
import { canSay, clearHush, hushFor, markSaid, saidToday, __resetForTest } from '../services/pet/saying-throttle'

const base: SayingContext = {
  now: new Date(2026, 8, 23, 10, 0),
  todayMerit: 0,
  realmTitle: '抱朴·守一',
  realmJustUp: false,
  justSeclusionMin: null,
  fixedUndone: 0,
  overdue: 0,
  nextClass: null,
  awayDays: 0,
}

describe('人格（数据，不是提示词）', () => {
  it('自称鲸鱼少女、称呼主人、只用简体中文', () => {
    expect(PERSONA.self).toBe('本鲸')
    expect(PERSONA.species).toBe('鲸鱼少女')
    expect(PERSONA.master).toBe('主人')
    expect(PERSONA.lang).toBe('zh-CN')
    expect(PERSONA_TRAITS).toContain('refuse-fat-talk')
  })

  it('「不许说胖」有独立出口（不是散在模板里的一句文案）', () => {
    expect(refuseFatTalk()).toContain('才不是胖')
  })
})

describe('pickSaying：优先级与"没事就不说"', () => {
  it('**什么都没变 → 什么都不说**（常态）', () => {
    expect(pickSaying(base)).toBeNull()
  })

  it('境界提升 > 闭关 > 课前 > 逾期 > 久别 > 功行 > 固定未做', () => {
    const all: SayingContext = {
      ...base,
      realmJustUp: true,
      justSeclusionMin: 25,
      nextClass: { name: '高数', minutesLeft: 9 },
      overdue: 2,
      awayDays: 5,
      todayMerit: 30,
      fixedUndone: 1,
    }
    expect(pickSaying(all)?.key.startsWith('realm')).toBe(true)

    expect(pickSaying({ ...all, realmJustUp: false })?.key).toBe('seclusion')
    expect(pickSaying({ ...all, realmJustUp: false, justSeclusionMin: null })?.key).toBe('class')
    expect(
      pickSaying({ ...all, realmJustUp: false, justSeclusionMin: null, nextClass: null })?.key,
    ).toBe('overdue:2')
    expect(
      pickSaying({
        ...all,
        realmJustUp: false,
        justSeclusionMin: null,
        nextClass: null,
        overdue: 0,
      })?.key,
    ).toBe('away')
    expect(
      pickSaying({
        ...all,
        realmJustUp: false,
        justSeclusionMin: null,
        nextClass: null,
        overdue: 0,
        awayDays: 0,
      })?.key,
    ).toBe('merit:3')
  })

  it('**功行按档去抖**：同一档位 key 不变，跨档才变', () => {
    expect(pickSaying({ ...base, todayMerit: 6 })?.key).toBe('merit:1')
    expect(pickSaying({ ...base, todayMerit: 9 })?.key).toBe('merit:1')
    expect(pickSaying({ ...base, todayMerit: 16 })?.key).toBe('merit:2')

    // 不足 5 功不算"进展"，不说
    expect(pickSaying({ ...base, todayMerit: 4 })).toBeNull()
  })

  it('久别只在 ≥3 天时开口（1–2 天不算久）', () => {
    expect(pickSaying({ ...base, awayDays: 2 })).toBeNull()
    expect(pickSaying({ ...base, awayDays: 3 })?.key).toBe('away')
  })

  it('课前给出"还有几分钟 + 在哪"，且分钟数不会是 0 或负', () => {
    const s = pickSaying({ ...base, nextClass: { name: '高数', minutesLeft: 0, room: 'A101' } })
    expect(s?.text).toContain('A101')
    expect(s?.text).toMatch(/还有 [1-9]/)
  })
})

describe('文案风格：白话短句（单条 ≤ 14 字）', () => {
  const cases: SayingContext[] = [
    { ...base, realmJustUp: true },
    { ...base, justSeclusionMin: 25 },
    { ...base, nextClass: { name: '高数', minutesLeft: 9 } },
    { ...base, overdue: 2 },
    { ...base, awayDays: 4 },
    { ...base, todayMerit: 30 },
    { ...base, fixedUndone: 1 },
  ]

  it('每条都短、都不夹英文', () => {
    for (const c of cases) {
      const s = pickSaying(c)
      expect(s).not.toBeNull()
      const text = s!.text.replace(/[·，。！？…]/g, '')
      // 懒人格的表征：短。留 20 的余量给"高数还有 9 分钟 · A101"这类带专名的
      expect(text.length).toBeLessThanOrEqual(20)
      expect(text).not.toMatch(/[A-Za-z]/)
    }
  })
})

describe('节流：防骚扰', () => {
  beforeEach(() => {
    __resetForTest()
  })

  it('同一档 30 分钟内只说一次', () => {
    const t0 = new Date(2026, 8, 23, 10, 0)
    expect(canSay('merit:1', t0)).toBe(true)
    markSaid('merit:1', t0)
    expect(canSay('merit:1', new Date(2026, 8, 23, 10, 20))).toBe(false)
    expect(canSay('merit:1', new Date(2026, 8, 23, 10, 31))).toBe(true)
  })

  it('不同档互不阻塞（涨到下一档该说就说）', () => {
    const t0 = new Date(2026, 8, 23, 10, 0)
    markSaid('merit:1', t0)
    expect(canSay('merit:2', t0)).toBe(true)
  })

  it('每日上限 12 条，跨天重置', () => {
    const day1 = new Date(2026, 8, 23, 9, 0)
    for (let i = 0; i < 12; i++) {
      markSaid(`k${i}`, day1)
    }
    expect(saidToday(day1)).toBe(12)
    expect(canSay('k12', day1)).toBe(false)

    // 第二天重新开始
    expect(canSay('k12', new Date(2026, 8, 24, 9, 0))).toBe(true)
    expect(saidToday(new Date(2026, 8, 24, 9, 0))).toBe(0)
  })

  it('「安静一小时」只压搭话，且到点自动恢复', () => {
    const before = Date.now()
    hushFor(60 * 60 * 1000)
    expect(canSay('x', new Date())).toBe(false)
    clearHush()
    // 清掉后立刻可说（不用等一小时）
    expect(canSay('x', new Date(before))).toBe(true)
  })
})

describe('好感度：只升不降、有上限', () => {
  it('每日首次互动只加一次', () => {
    expect(affinityGain('first-interact', 0)).toBe(1)
    expect(affinityGain('first-interact', 1)).toBe(0)
  })

  it('点击有每日上限（连点刷不出高好感）', () => {
    expect(affinityGain('click', 0)).toBe(1)
    expect(affinityGain('click', 2)).toBe(1)
    expect(affinityGain('click', 3)).toBe(0)
  })

  it('闭关给得比点击多，且不限次（认真做事值得更多）', () => {
    expect(affinityGain('seclusion')).toBe(2)
    expect(affinityGain('seclusion', 5)).toBe(2)
  })

  it('未知事件不加分（不是"报了就有"）', () => {
    // @ts-expect-error 故意用不存在的事件，验证不会误给分
    expect(affinityGain('nope')).toBe(0)
  })
})

describe('好感度里程碑：只发一次', () => {
  it('满 7 天发一次，发过就不再发', () => {
    expect(milestoneGain(7)).toBe(5)
    expect(milestoneGain(7, [7])).toBe(0)
  })

  it('满 30 天时两个里程碑一起补（之前没发过的话）', () => {
    expect(milestoneGain(30)).toBe(25)
    expect(milestoneGain(30, [7])).toBe(20)
  })

  it('未达标不发', () => {
    expect(milestoneGain(6)).toBe(0)
    expect(milestoneDaysReached(6)).toEqual([])
  })
})

describe('相识天数', () => {
  it('满 24 小时算一天；非法时间按 0 天（不崩）', () => {
    expect(daysTogether('2026-09-20T00:00:00.000Z', new Date('2026-09-23T00:00:00.000Z'))).toBe(3)
    expect(daysTogether('', new Date())).toBe(0)
    expect(daysTogether('乱七八糟', new Date())).toBe(0)
  })
})

describe('饭点窗口（FOOD_RICE 特质的出口）', () => {
  const at = (h: number, m: number) => new Date(2026, 8, 23, h, m)

  it('午/晚两个窗口内才算饭点', () => {
    expect(isMealTime(at(11, 29))).toBe(false)
    expect(isMealTime(at(11, 30))).toBe(true)
    expect(isMealTime(at(12, 30))).toBe(true)
    expect(isMealTime(at(12, 31))).toBe(false)
    expect(isMealTime(at(17, 30))).toBe(true)
    expect(isMealTime(at(19, 0))).toBe(true)
    expect(isMealTime(at(19, 1))).toBe(false)
    // 夜里不该喊饿
    expect(isMealTime(at(2, 0))).toBe(false)
  })

  it('饭点排在**最低**优先级：有事时先说事', () => {
    const noon = { ...base, now: at(12, 0), overdue: 1 }
    expect(pickSaying(noon)?.key).toBe('overdue:1')
    // 只在真没事时才提吃饭
    expect(pickSaying({ ...base, now: at(12, 0) })?.key).toBe('meal')
  })
})
