/**
 * 逐日结算原语与额外功行（`settleDaily` / `totalCultivation` / `seclusionReward`）
 *
 * `settleDaily` 是**通用原语**：今日炁象与功行都靠它逐日累加，所以它错了两边都错。
 * 两条不变式：
 *  ① **同一天只补差额** —— 一天打开五次不会乘五倍，且当天越用越高；
 *  ② **只升不降** —— 撤销动作使今日值变低时不回收已计入的量。
 * 另有最容易漏的一条：总量必须含「今日已计」，漏了就会出现"今天白干、明天才涨"。
 *
 * ⚠️ 境界（六境 · 抱朴六轮）在 `merit.test.ts`；这里是炁象与结算，两者口径不得混用。
 */
import { describe, expect, it } from 'vitest'
import {
  emptyCultivationState,
  seclusionReward,
  settleDaily,
  totalCultivation,
} from '../services/cultivation'

describe('settleDaily：逐日结算原语', () => {
  it('首次结算把今日值计入', () => {
    const s = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 30, '2026-09-22')
    expect(s).toEqual({ total: 0, todayDate: '2026-09-22', todayCounted: 30, gained: 30 })
  })

  it('同一天再结算只补差额 —— 一天打开五次也不会乘五倍', () => {
    let s = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 30, '2026-09-22')
    s = settleDaily(s, 45, '2026-09-22')
    expect(s.gained).toBe(15)
    expect(s.todayCounted).toBe(45)
    // 值没变则不再产出
    expect(settleDaily(s, 45, '2026-09-22').gained).toBe(0)
  })

  it('跨天把当日计数落账、今日归零', () => {
    const day1 = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 60, '2026-09-22')
    const day2 = settleDaily(day1, 20, '2026-09-23')
    expect(day2.total).toBe(60)
    expect(day2.todayCounted).toBe(20)
    expect(day2.gained).toBe(20)
  })

  it('只升不降：撤销动作使今日值变低时不回收已计入的量', () => {
    const s = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 70, '2026-09-22')
    const dropped = settleDaily(s, 40, '2026-09-22')
    expect(dropped.gained).toBe(0)
    expect(dropped.todayCounted).toBe(70)
  })
})

describe('totalCultivation：总量口径', () => {
  it('= 已落账往日 + 今日已计 + 额外（漏掉今日就会"今天白干"）', () => {
    expect(totalCultivation({ total: 100, bonus: 0, todayCounted: 30 })).toBe(130)
    expect(totalCultivation({ total: 100, bonus: 50, todayCounted: 30 })).toBe(180)
  })

  it('今日已计缺省时按 0（兼容只传 total/bonus 的调用）', () => {
    expect(totalCultivation({ total: 100, bonus: 20 })).toBe(120)
  })
})

describe('闭关额外功行 seclusionReward', () => {
  it('基础 20 + 每 10 分钟 5 点', () => {
    expect(seclusionReward(0)).toBe(20)
    expect(seclusionReward(10)).toBe(25)
    expect(seclusionReward(25)).toBe(30)
    expect(seclusionReward(60)).toBe(50)
    expect(seclusionReward(90)).toBe(65)
  })

  it('不足 10 分钟的部分不计（向下取整，不做四舍五入）', () => {
    expect(seclusionReward(19)).toBe(25)
    expect(seclusionReward(20)).toBe(30)
  })

  it('一次完整闭关的收益足够显著（配得上"专门的提升方式"）', () => {
    // 一次 60 分钟闭关 = 50 功行，相当于把一整个板块的当日上限拉满并超出
    expect(seclusionReward(60)).toBeGreaterThanOrEqual(50)
  })
})

describe('空状态 emptyCultivationState', () => {
  it('各字段从 0/null 起，不是 undefined（否则首屏会显示 NaN）', () => {
    const s = emptyCultivationState()
    expect(s.id).toBe('cultivation')
    expect(s.total).toBe(0)
    expect(s.bonus).toBe(0)
    expect(s.todayDate).toBe('')
    expect(s.todayCounted).toBe(0)
    expect(s.seclusionCount).toBe(0)
    // 「历史最高境界」（bestRank/bestTitle/bestAt）已删除：这里守住它**不会回来** ——
    // 境界是累计功行的纯函数，只升不降，不需要另记一份最高值
    expect('bestRank' in s).toBe(false)
    expect('bestTitle' in s).toBe(false)
    expect('bestAt' in s).toBe(false)
  })
})
