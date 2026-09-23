/**
 * 天机动作协议 · 解析与校验
 *
 * ## 2026-09-22 开放化后，这个文件的立场变了
 * 协议不再硬编码动作名 —— 它只拿一份**规格表**（由插件申报）做通用校验。
 * 所以测试相应分成两层：
 *  ① **引擎层**：用自造的规格表，验证字段类型 / 必填 / 回退 / 丢弃语义；
 *  ② **接线层**：用真实的 `actionSpecs()`（来自插件注册表），
 *     验证"插件申报的动作真的能被解析出来" —— 只测引擎不测接线，
 *     会出现"引擎全绿但加了动作却没生效"的空档。
 */
import { describe, expect, it } from 'vitest'
import { parseTianjiActions, type TianjiActionSpec } from '../components/ai/action-protocol'
import { actionSpecs } from '../components/ai/plugins'

/** 自造规格表（引擎层测试用；与真实业务解耦） */
const SPECS: Record<string, TianjiActionSpec> = {
  demo_text: { fields: { title: { kind: 'text', required: true }, body: { kind: 'text' } } },
  demo_choice: { fields: { mode: { kind: 'choice', values: ['a', 'b'], fallback: 'a' } } },
  demo_amount: { fields: { amount: { kind: 'amount' } } },
  demo_date: { fields: { date: { kind: 'date' } } },
  demo_list: { fields: { tags: { kind: 'textList' } } },
}

const fence = (obj: unknown) => '前面的话\n```json\n' + JSON.stringify(obj) + '\n```'

describe('引擎层：围栏识别', () => {
  it('没有动作块 → 空数组', () => {
    expect(parseTianjiActions('就是一段普通回答', SPECS)).toEqual([])
  })

  it('非 JSON 的代码围栏不报错、不产出', () => {
    expect(parseTianjiActions('```js\nconst a = 1\n```', SPECS)).toEqual([])
  })

  it('非对象 / 缺 action 字段 → 跳过', () => {
    expect(parseTianjiActions(fence([1, 2, 3]), SPECS)).toEqual([])
    expect(parseTianjiActions(fence({ title: '无 action' }), SPECS)).toEqual([])
  })

  it('一个围栏里放数组也支持', () => {
    const out = parseTianjiActions(
      fence([
        { action: 'demo_text', title: '甲' },
        { action: 'demo_text', title: '乙' },
      ]),
      SPECS,
    )
    expect(out.map((a) => a.fields.title)).toEqual(['甲', '乙'])
  })

  it('多条围栏全部抽出', () => {
    const text =
      fence({ action: 'demo_text', title: '甲' }) + '\n中间的话\n' + fence({ action: 'demo_text', title: '乙' })
    expect(parseTianjiActions(text, SPECS)).toHaveLength(2)
  })

  it('自然语言混在动作块外不影响抽取', () => {
    const out = parseTianjiActions('我给你记一条：\n' + fence({ action: 'demo_text', title: '买盐' }), SPECS)
    expect(out).toHaveLength(1)
  })
})

describe('引擎层：字段规格语义', () => {
  it('必填文本为空 → 整条丢弃', () => {
    expect(parseTianjiActions(fence({ action: 'demo_text', title: '   ' }), SPECS)).toEqual([])
    expect(parseTianjiActions(fence({ action: 'demo_text' }), SPECS)).toEqual([])
  })

  it('非必填文本缺省 → 空串（不是 undefined）', () => {
    expect(parseTianjiActions(fence({ action: 'demo_text', title: '甲' }), SPECS)[0].fields.body).toBe('')
  })

  it('choice 非法值回退 fallback；无 fallback 则丢弃', () => {
    expect(parseTianjiActions(fence({ action: 'demo_choice', mode: 'zzz' }), SPECS)[0].fields.mode).toBe('a')
    const noFallback: Record<string, TianjiActionSpec> = { x: { fields: { m: { kind: 'choice', values: ['a'] } } } }
    expect(parseTianjiActions(fence({ action: 'x', m: 'zzz' }), noFallback)).toEqual([])
  })

  it('amount 必须有限正数，且规整到分', () => {
    expect(parseTianjiActions(fence({ action: 'demo_amount', amount: 12.345 }), SPECS)[0].fields.amount).toBe(12.35)
    expect(parseTianjiActions(fence({ action: 'demo_amount', amount: 0 }), SPECS)).toEqual([])
    expect(parseTianjiActions(fence({ action: 'demo_amount', amount: -5 }), SPECS)).toEqual([])
    expect(parseTianjiActions(fence({ action: 'demo_amount', amount: 'abc' }), SPECS)).toEqual([])
  })

  it('date 非法只退回 null，**不作废整条动作**', () => {
    const out = parseTianjiActions(fence({ action: 'demo_date', date: '2026-02-30' }), SPECS)
    expect(out[0].fields.date).toBeNull()
    expect(parseTianjiActions(fence({ action: 'demo_date', date: '2026-03-01' }), SPECS)[0].fields.date).toBe(
      '2026-03-01',
    )
  })

  it('textList 过滤非字符串项', () => {
    expect(parseTianjiActions(fence({ action: 'demo_list', tags: ['a', 1, null, 'b'] }), SPECS)[0].fields.tags).toEqual(
      ['a', 'b'],
    )
    expect(parseTianjiActions(fence({ action: 'demo_list' }), SPECS)[0].fields.tags).toEqual([])
  })

  it('**规格里没有的字段一律丢弃**（模型多写不该透传进库）', () => {
    const out = parseTianjiActions(fence({ action: 'demo_text', title: '甲', 危险字段: 'x', id: 'fake' }), SPECS)
    expect(out[0].fields).toEqual({ title: '甲', body: '' })
  })

  it('**未申报的动作被跳过**（这正是"开放"的边界：没申报就解析不出来）', () => {
    expect(parseTianjiActions(fence({ action: 'delete_everything', id: 'x' }), SPECS)).toEqual([])
  })
})

describe('接线层：真实插件注册表申报的动作能被解析', () => {
  const specs = actionSpecs()

  it('三个动作都在规格表里（缺失即"加了动作但没生效"）', () => {
    expect(Object.keys(specs).sort()).toEqual(['create_finance', 'create_note', 'create_task'])
  })

  it('create_task：priority 非法回退 mid、dueDate 非法回退 null', () => {
    const out = parseTianjiActions(
      fence({ action: 'create_task', title: '写周报', priority: 'urgent', dueDate: '2026-13-01' }),
      specs,
    )
    expect(out[0].fields).toEqual({ title: '写周报', priority: 'mid', dueDate: null })
  })

  it('create_note：tags 非数组 → 空数组', () => {
    const out = parseTianjiActions(fence({ action: 'create_note', title: '随记', tags: '不是数组' }), specs)
    expect(out[0].fields.tags).toEqual([])
  })

  it('create_finance：kind 缺失即丢弃（收支不明不能建行）', () => {
    expect(parseTianjiActions(fence({ action: 'create_finance', amount: 20 }), specs)).toEqual([])
  })

  it('create_finance：缺省 category 回退「未分类」', () => {
    const out = parseTianjiActions(fence({ action: 'create_finance', kind: 'expense', amount: 20 }), specs)
    expect(out[0].fields.category).toBe('未分类')
  })
})
