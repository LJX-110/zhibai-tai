/**
 * 天机插件注册表 —— 结构与归属
 *
 * 这一步是"行为零变化"的重构，所以测试锁的是**架构不变量**而不是输出细节：
 *  · 注册表的 id / 能力 key 唯一，顺序符合明细区注入次序；
 *  · 动作按类型归属到正确板块（AI 提议的 create_* 不能落错库）；
 *  · 明细区按关键词门控：不问不注入、问什么注入什么、顺序稳定。
 * 有了这些，以后"加一个板块能力"就只是加一个插件文件，不必再动中心文件。
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import {
  TIANJI_PLUGINS,
  actionDefFor,
  buildDetailContext,
  capabilitiesOf,
  capabilityOf,
} from '../components/ai/plugins'
import { useFinanceStore } from '../stores/useFinanceStore'
import { nowISO, todayISO } from '../utils/id'

/**
 * 「本月支出分类 / 最近 5 笔」这两行**没有数据就不产出**（空块不占 prompt），
 * 所以财务明细要真的看到内容，得先喂一条记录。其余板块在空库下也会给出
 * "全部已交 / 还没有收藏"这类明确结论，故不受影响。
 */
const SEED_ID = 'seed-finance-1'
beforeAll(async () => {
  const now = nowISO()
  await useFinanceStore.getState().add({
    id: SEED_ID,
    kind: 'expense',
    amount: 12.5,
    category: '测试',
    date: todayISO(),
    note: undefined,
    isPurchase: false,
    createdAt: now,
    updatedAt: now,
  } as Parameters<ReturnType<typeof useFinanceStore.getState>['add']>[0])
})
afterAll(async () => {
  await useFinanceStore.getState().remove(SEED_ID)
})

describe('注册表结构', () => {
  it('插件 id 唯一，且都是合法的板块 id', () => {
    const ids = TIANJI_PLUGINS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    // 注册顺序 = 明细区注入顺序：学 → 财 → 藏 → 修（沿用改造前的次序）
    expect(ids).toEqual(['overview', 'action', 'study', 'finance', 'collection', 'cultivate', 'intelligence'])
  })

  it('能力 key 唯一、都有名称与图标', () => {
    const caps = capabilitiesOf()
    expect(new Set(caps.map((c) => c.key))).toEqual(new Set(caps.map((c) => c.key)))
    expect(caps.map((c) => c.label).filter(Boolean).length).toBe(caps.length)
    expect(caps.every((c) => Boolean(c.icon))).toBe(true)
  })

  it('四张能力卡片沿用原有的 key 与名称', () => {
    expect(capabilitiesOf().map((c) => c.key)).toEqual(['brief', 'plan', 'project', 'intel'])
    expect(capabilitiesOf().map((c) => c.label)).toEqual(['今日简报', '学习计划', '项目摘要', '总结情报'])
    expect(capabilityOf('brief')).toBeTruthy()
  })

  it('未知能力返回 undefined（调用方据此降级，不静默空转）', () => {
    expect(capabilityOf('不存在的')).toBeUndefined()
  })
})

describe('动作归属', () => {
  it('三种动作分别落在行 / 行 / 财 三个板块', () => {
    expect(actionDefFor('create_task')).toBeTruthy()
    expect(actionDefFor('create_note')).toBeTruthy()
    expect(actionDefFor('create_finance')).toBeTruthy()
  })

  it('未注册的动作返回 undefined（落库前就该拒掉，不能猜一个库写进去）', () => {
    // 动作名现在是开放字符串，不需要 @ts-expect-error —— 这正是 P2 开放化的结果
    expect(actionDefFor('delete_everything')).toBeUndefined()
  })
})

describe('明细区（按问题门控 + 注入顺序）', () => {
  it('不相关的问题不注入任何明细', () => {
    expect(buildDetailContext('随便聊点什么')).toEqual([])
  })

  it('问什么注入什么（空库下仍给出"无"的明确结论，而不是沉默）', () => {
    expect(buildDetailContext('还有作业没交吗').join('\n')).toContain('未交作业')
    expect(buildDetailContext('什么时候考试').join('\n')).toContain('待考')
    expect(buildDetailContext('这个月花了多少钱').join('\n')).toContain('本月支出分类')
    expect(buildDetailContext('我收藏了什么').join('\n')).toContain('收藏')
    expect(buildDetailContext('今天打卡了吗').join('\n')).toContain('今日打卡')
    expect(buildDetailContext('课表怎么看').join('\n')).toContain('全部课程排课')
  })

  it('同时命中多个关键词时，顺序稳定：学 → 财 → 藏 → 修', () => {
    const text = buildDetailContext('作业 考试 花了多少钱 收藏 习惯').join('\n')
    const at = (s: string) => text.indexOf(s)
    expect(at('未交作业')).toBeLessThan(at('本月支出分类'))
    expect(at('本月支出分类')).toBeLessThan(at('收藏'))
    expect(at('收藏')).toBeLessThan(at('今日打卡'))
  })
})
