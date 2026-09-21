/**
 * 修行境界（持续累积）
 *
 * 这次改造把「境界」从**每日快照**改成**持续累积**，最怕三件事：
 *  ① 同一天重复累加（一天打开五次就乘五倍）；
 *  ② 今日修为要等跨天才涨（数字与体感对不上）；
 *  ③ 忙几天没记录，已经把境界修到的份上被抹掉。
 * 逐条钉死。
 */
import { describe, expect, it } from 'vitest'
import {
  emptyCultivationState,
  realmOf,
  realmProgress,
  REALM_THRESHOLDS,
  seclusionReward,
  settleDaily,
  totalCultivation,
} from '../services/cultivation'

describe('今日结算 settleDaily', () => {
  it('首次结算把今日总分计入', () => {
    const s = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 30, '2026-09-21')
    expect(s).toEqual({ total: 0, todayDate: '2026-09-21', todayCounted: 30, gained: 30 })
  })

  it('同一天再结算只补差额 —— 一天打开五次也不会乘五倍', () => {
    let s = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 30, '2026-09-21')
    s = settleDaily(s, 45, '2026-09-21')
    expect(s.gained).toBe(15)
    expect(s.todayCounted).toBe(45)
    // 分数没变时不再产出
    expect(settleDaily(s, 45, '2026-09-21').gained).toBe(0)
  })

  it('跨天把当日计数落账、今日归零', () => {
    const day1 = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 60, '2026-09-21')
    const day2 = settleDaily(day1, 20, '2026-09-22')
    expect(day2.total).toBe(60) // 昨日 60 落账
    expect(day2.todayCounted).toBe(20)
    expect(day2.gained).toBe(20)
  })

  it('只升不降：今日分数因撤销变低时不回收已计入的修为', () => {
    const s = settleDaily({ total: 0, todayDate: '', todayCounted: 0 }, 70, '2026-09-21')
    const dropped = settleDaily(s, 40, '2026-09-21')
    expect(dropped.gained).toBe(0)
    expect(dropped.todayCounted).toBe(70) // 不降
  })
})

describe('修为总量 totalCultivation', () => {
  it('= 已落账往日 + 今日已计 + 闭关额外（漏掉今日就会"今天白干"）', () => {
    expect(totalCultivation({ total: 100, bonus: 0, todayCounted: 30 })).toBe(130)
    expect(totalCultivation({ total: 100, bonus: 50, todayCounted: 30 })).toBe(180)
  })

  it('今日已计缺省时按 0（兼容只传 total/bonus 的调用）', () => {
    expect(totalCultivation({ total: 100, bonus: 20 })).toBe(120)
  })
})

describe('境界 realmOf', () => {
  it('按门槛定阶，五阶依次递进', () => {
    expect(realmOf(0).title).toBe('抱朴守一')
    expect(realmOf(299).title).toBe('抱朴守一')
    expect(realmOf(300).title).toBe('炼精化气')
    expect(realmOf(900).title).toBe('炼气化神')
    expect(realmOf(2700).title).toBe('炼神还虚')
    expect(realmOf(8100).title).toBe('炼虚合道')
    expect(realmOf(99999).rank).toBe(4)
  })

  it('门槛是单调递增的常量表（改门槛只需改这一处）', () => {
    for (let i = 1; i < REALM_THRESHOLDS.length; i++) {
      expect(REALM_THRESHOLDS[i]).toBeGreaterThan(REALM_THRESHOLDS[i - 1])
    }
  })

  it('空状态从最低阶起（不是 undefined）', () => {
    const s = emptyCultivationState()
    expect(s.total).toBe(0)
    expect(s.bonus).toBe(0)
    expect(s.bestRank).toBe(0)
    expect(s.bestTitle).toBe('抱朴守一')
  })
})

describe('距下一阶的进度 realmProgress', () => {
  it('阶内进度按当前阶区间算，并给出还差多少', () => {
    // 炼精化气区间 300-900，取中点 600 → 50%
    const p = realmProgress(600)
    expect(p.realm.title).toBe('炼精化气')
    expect(p.next).toBe(900)
    expect(p.nextTitle).toBe('炼气化神')
    expect(p.percent).toBeCloseTo(0.5)
    expect(p.remaining).toBe(300)
  })

  it('刚跨阶时进度归零', () => {
    expect(realmProgress(900).percent).toBe(0)
    expect(realmProgress(900).remaining).toBe(1800)
  })

  it('顶阶不再有下一阶，进度记满', () => {
    const p = realmProgress(9000)
    expect(p.next).toBeNull()
    expect(p.nextTitle).toBeNull()
    expect(p.percent).toBe(1)
    expect(p.remaining).toBe(0)
  })
})

describe('闭关奖励 seclusionReward', () => {
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

  it('一次完整闭关的收益高于一天零散道行的一半（才配得上"专门的提升方式"）', () => {
    // 每日满分 100；60 分钟闭关 50 点 ≈ 半天的量
    expect(seclusionReward(60)).toBeGreaterThanOrEqual(50)
  })
})
