/**
 * 天机动作解析（纯逻辑）单测
 *
 * 这条解析是「模型输出 → 预览卡片」的唯一入口：解析失败 / 缺必填 / 未知类型
 * 都必须静默跳过（绝不报错、绝不渲染空卡片），所以下面专门压「坏输入不出事」与
 * 「好输入精确成形」两类边界。不依赖 store / DOM，node 环境即可跑。
 */
import { describe, expect, it } from 'vitest'
import { parseTianjiActions } from '../components/ai/action-protocol'

describe('parseTianjiActions', () => {
  it('无动作块时返回空数组', () => {
    expect(parseTianjiActions('帮我建个待办吧')).toEqual([])
  })

  it('普通代码块（非 JSON）不报错、不产出', () => {
    expect(parseTianjiActions('```js\nconst a = 1\n```')).toEqual([])
  })

  it('解析单条 create_task', () => {
    const r = parseTianjiActions(
      '```json\n{"action":"create_task","title":"交实验报告","priority":"high","dueDate":"2026-09-20"}\n```',
    )
    expect(r).toEqual([{ action: 'create_task', title: '交实验报告', priority: 'high', dueDate: '2026-09-20' }])
  })

  it('缺标题的 create_task 被丢弃', () => {
    expect(parseTianjiActions('```json\n{"action":"create_task"}\n```')).toEqual([])
  })

  it('未知 priority 回退 mid，非法 dueDate 回退 null', () => {
    const r = parseTianjiActions(
      '```json\n{"action":"create_task","title":"x","priority":"urgent","dueDate":"不是日期"}\n```',
    )
    expect(r).toEqual([{ action: 'create_task', title: 'x', priority: 'mid', dueDate: null }])
  })

  it('解析 create_note 与 create_finance（缺省字段补默认值）', () => {
    const r = parseTianjiActions(
      ['```json', JSON.stringify({ action: 'create_note', title: '灵感', body: '正文', tags: ['a', 'b'] }), '```',
        '```json', JSON.stringify({ action: 'create_finance', kind: 'expense', amount: 12.5, category: '餐饮' }), '```'].join('\n'),
    )
    expect(r).toContainEqual({ action: 'create_note', title: '灵感', body: '正文', tags: ['a', 'b'] })
    expect(r).toContainEqual({ action: 'create_finance', kind: 'expense', amount: 12.5, category: '餐饮', note: '', date: null })
  })

  it('一个围栏里放数组也支持', () => {
    const r = parseTianjiActions(
      '```json\n' +
        JSON.stringify([
          { action: 'create_task', title: 'A' },
          { action: 'create_finance', kind: 'income', amount: 100, category: '工资' },
        ]) +
        '\n```',
    )
    expect(r).toHaveLength(2)
  })

  it('金额非正的 finance 被丢弃', () => {
    expect(parseTianjiActions('```json\n{"action":"create_finance","kind":"expense","amount":0,"category":"x"}\n```')).toEqual([])
  })

  it('kind 非法的 finance 被丢弃', () => {
    expect(parseTianjiActions('```json\n{"action":"create_finance","kind":"refund","amount":10,"category":"x"}\n```')).toEqual([])
  })

  it('非创建类动作（删除）被忽略，第一版只做创建', () => {
    expect(parseTianjiActions('```json\n{"action":"delete_task","id":"abc"}\n```')).toEqual([])
  })

  it('自然语言混在动作块外也能抽出动作', () => {
    const text =
      '好的，我帮你记一笔。\n```json\n{"action":"create_finance","kind":"expense","amount":30,"category":"打车"}\n```'
    const r = parseTianjiActions(text)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ action: 'create_finance', amount: 30 })
  })

  it('多条围栏（每条一个动作）全部抽出', () => {
    const text =
      '```json\n{"action":"create_task","title":"A"}\n```\n```json\n{"action":"create_note","title":"B"}\n```'
    expect(parseTianjiActions(text)).toHaveLength(2)
  })
})
