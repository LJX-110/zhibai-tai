/**
 * 功行与境界（六境 + 抱朴六轮）
 *
 * 这一版最怕三件事，逐条钉住：
 *  ① **同一天重复累加**（结算层原语的问题，由 cultivation.test.ts 覆盖）；
 *  ② **拿错口径**：境界只能由「累计功行」定，绝不能再拿"今日某分数"当判据 ——
 *     那种口径今天不记录就掉阶，等于每天清零重来；
 *  ③ **只覆盖部分板块**：九板块里任何一个漏掉，用户在那个板块做的事就白做。
 */
import { describe, expect, it } from 'vitest'
import { dailyMerit, REALM_STEPS, realmOf, realmProgress } from '../services/merit'
import { toISODate } from '../utils/id'
import type { ActivityItem, ActivityType } from '../types/entities'

/** 造一条今天的流水 */
function act(entityType: ActivityType, at = new Date()): ActivityItem {
  return {
    id: `a-${entityType}-${at.getTime()}-${Math.random()}`,
    entityType,
    entityId: 'e1',
    timestamp: at.toISOString(),
    title: 't',
  } as ActivityItem
}

describe('今日净行 dailyMerit', () => {
  const today = toISODate(new Date())

  it('九板块的动作都能记功 —— 一个都不能漏', () => {
    // 每个板块给一条对应类型的流水
    const cases: [ActivityType, string][] = [
      ['task', '行'],
      ['habit', '修'],
      ['pomodoro', '学'],
      ['finance', '财'],
      ['collection', '藏'],
      ['intelligence', '情'],
      ['divination', '奇'],
      ['ai', '术'],
    ]
    for (const [type, label] of cases) {
      const d = dailyMerit([act(type)], today)
      const hit = d.sections.find((s) => s.label === label)
      expect(hit, `${label} 板块应有净行`).toBeTruthy()
      expect(hit!.merit, `${label} 板块应记到功行`).toBeGreaterThan(0)
    }
  })

  it('无动作时为 0（不是 null/NaN）', () => {
    const d = dailyMerit([], today)
    expect(d.total).toBe(0)
    expect(d.sections).toHaveLength(8)
    expect(d.sections.every((s) => s.merit === 0)).toBe(true)
  })

  it('每板块每日上限 8 功 —— 重复刷同一件事不再有意义', () => {
    const many = Array.from({ length: 50 }, () => act('task'))
    const d = dailyMerit(many, today)
    const action = d.sections.find((s) => s.label === '行')!
    expect(action.count).toBe(50)
    expect(action.merit).toBe(8) // 上限而非 50×2=100
  })

  it('只统计**今天**的流水（昨天的不算）', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const d = dailyMerit([act('task', yesterday)], today)
    expect(d.total).toBe(0)
  })

  it('时间戳是 UTC 串，跨零点判定必须走本地日期（东八区凌晨不能算成昨天）', () => {
    // 本地今天 00:30 → UTC 串落在昨天
    const at = new Date()
    at.setHours(0, 30, 0, 0)
    const d = dailyMerit([act('task', at)], today)
    expect(d.total).toBeGreaterThan(0)
  })

  it('坏时间戳被跳过而不是抛错', () => {
    const bad = { ...act('task'), timestamp: '不是时间' } as ActivityItem
    expect(() => dailyMerit([bad], today)).not.toThrow()
    expect(dailyMerit([bad], today).total).toBe(0)
  })
})

describe('境界 realmOf（六境 + 抱朴六轮）', () => {
  it('六境依次递进，抱朴境内带轮名', () => {
    expect(realmOf(0).title).toBe('抱朴·守一')
    expect(realmOf(14).title).toBe('抱朴·守一')
    expect(realmOf(15).title).toBe('抱朴·心斋')
    expect(realmOf(75).title).toBe('抱朴·撄宁')
    expect(realmOf(90).realm).toBe('冲和')
    expect(realmOf(300).realm).toBe('玄同')
    expect(realmOf(900).realm).toBe('凝神')
    expect(realmOf(2400).realm).toBe('逍遥')
    expect(realmOf(6000).realm).toBe('合道')
    expect(realmOf(999999).realm).toBe('合道')
  })

  it('抱朴境外的境界不带轮名（轮只是抱朴里的层次）', () => {
    expect(realmOf(90).title).toBe('冲和')
    expect(realmOf(90).wheel).toBeUndefined()
  })

  it('尊称只在筑基以上给 —— 与《玄鉴仙族》体系一致', () => {
    expect(realmOf(300).honorific).toBe('道人') // 玄同
    expect(realmOf(900).honorific).toBe('真人') // 凝神
    expect(realmOf(2400).honorific).toBe('真君') // 逍遥
    expect(realmOf(0).honorific).toBeUndefined()
    expect(realmOf(90).honorific).toBeUndefined()
  })

  it('门槛严格单调递增（否则会出现"涨了反而掉阶"）', () => {
    for (let i = 1; i < REALM_STEPS.length; i++) {
      expect(REALM_STEPS[i].at).toBeGreaterThan(REALM_STEPS[i - 1].at)
    }
  })

  it('**前期必须快**：头六阶（抱朴六轮）每 15 功一进 —— 这是"提升过慢"的解药', () => {
    const early = REALM_STEPS.slice(0, 6).map((s) => s.at)
    expect(early).toEqual([0, 15, 30, 45, 60, 75])
    // 也就是说：15 功就能看到第一次进阶，而 15 功是一天左右正常使用的量
    expect(REALM_STEPS[1].at).toBeLessThanOrEqual(20)
  })
})

describe('距下一阶 realmProgress', () => {
  it('阶内进度按当前阶区间算，并给出还差多少', () => {
    // 抱朴·心斋 区间 15-30，取中点 22（取整）
    const p = realmProgress(22)
    expect(p.realm.title).toBe('抱朴·心斋')
    expect(p.next).toBe(30)
    expect(p.nextTitle).toBe('抱朴·坐忘')
    expect(p.remaining).toBe(8)
    expect(p.percent).toBeGreaterThan(0)
    expect(p.percent).toBeLessThan(1)
  })

  it('刚跨阶时进度归零', () => {
    expect(realmProgress(90).percent).toBe(0)
    expect(realmProgress(90).nextTitle).toBe('玄同')
  })

  it('顶阶不再有下一阶，进度记满', () => {
    const p = realmProgress(99999)
    expect(p.next).toBeNull()
    expect(p.nextTitle).toBeNull()
    expect(p.percent).toBe(1)
    expect(p.remaining).toBe(0)
  })

  it('0 功行也能给出第一阶（不是 undefined）', () => {
    const p = realmProgress(0)
    expect(p.realm.title).toBe('抱朴·守一')
    expect(p.remaining).toBe(15)
  })
})
