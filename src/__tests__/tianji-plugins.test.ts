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
  agentToolById,
  agentTools,
  buildDetailContext,
  capabilitiesOf,
  capabilityOf,
} from '../components/ai/plugins'
import { confirmationTools, executableTools, toolConsistencyError } from '../services/agent/tools'
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
    // 注册顺序 = 明细区注入顺序：学 → 财 → 藏 → 修 → 情，核心插件（记忆）在**末尾**（无明细区）
    expect(ids).toEqual(['overview', 'action', 'study', 'finance', 'collection', 'cultivate', 'intelligence', 'core'])
  })

  it('核心插件排在末尾，因此明细区注入次序不变', () => {
    // 有明细区的插件相对次序不变（overview / action 本来就没有明细区，只有一键能力）
    const withDetail = TIANJI_PLUGINS.filter((p) => p.detail)
    expect(withDetail.map((p) => p.id)).toEqual(['study', 'finance', 'collection', 'cultivate'])
    expect(TIANJI_PLUGINS[TIANJI_PLUGINS.length - 1].id).toBe('core')
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
  it('金额类动作落在「财」板块（它必须走预览确认）', () => {
    expect(actionDefFor('create_finance')).toBeTruthy()
  })

  it('**建任务 / 建笔记不再是动作** —— 它们已改为可直接执行的工具（Step 4-3 · 二）', () => {
    // 上一版两条路并存，模型经常选到"请主人自己确认"那条；现在只保留工具这条路
    expect(actionDefFor('create_task')).toBeUndefined()
    expect(actionDefFor('create_note')).toBeUndefined()
  })

  it('未注册的动作返回 undefined（落库前就该拒掉，不能猜一个库写进去）', () => {
    expect(actionDefFor('delete_everything')).toBeUndefined()
  })
})

describe('工具注册表（Step 4-3 · 一）', () => {
  it('每个工具都声明齐八项，且 mode 与 requiresConfirmation 不矛盾', () => {
    const tools = agentTools()
    expect(tools.length).toBeGreaterThan(5)
    for (const t of tools) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.description.length).toBeGreaterThan(10)
      expect(t.inputSchema).toBeTypeOf('object')
      expect(toolConsistencyError(t)).toBeNull()
    }
  })

  it('read / safe-write 可直接执行；requires-confirmation 只被提议', () => {
    const tools = agentTools()
    const auto = executableTools(tools)
    const need = confirmationTools(tools)
    expect(auto.length + need.length).toBe(tools.length)
    expect(auto.every((t) => t.mode === 'read' || t.mode === 'safe-write')).toBe(true)
    expect(need.map((t) => t.id)).toEqual(['memory.save'])
  })

  it('第一批可自动写入的只有建待办与记笔记', () => {
    const writable = executableTools(agentTools())
      .filter((t) => t.mode === 'safe-write')
      .map((t) => t.id)
    expect(writable.sort()).toEqual(['notes.create', 'tasks.create'])
  })

  it('按 id 找得到（确认卡片执行"那一下"的唯一入口）', () => {
    expect(agentToolById('memory.save')?.mode).toBe('requires-confirmation')
    expect(agentToolById('不存在的工具')).toBeUndefined()
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
