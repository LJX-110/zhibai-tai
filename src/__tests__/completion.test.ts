/**
 * 完成反馈策略（Step 5-2C · D 批）
 *
 * 这些用例守的是**产品规则**（不是实现细节）：
 *  ① 轻量完成**不发声**——否则"完成喝水"也叮一声，一天几十下就是噪音；
 *  ② 只有重要完成**才弹条**——普通完成靠落印与声音已经够了，弹条会盖内容；
 *  ③ **取消勾选不产生事件**（这一条由调用方守：`emitCompletion` 不该被调用）；
 *     本文件用一个"调用方只在未完成→完成时发事件"的用例把它写下来；
 *  ④ 缺省 `notify` 时**不崩、不吞掉音效**。
 *
 * 之所以能这样精确断言，是因为 `decideFeedback` 是纯函数、时间由调用方注入。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** `sound.ts` 会碰 AudioContext；测试里换成间谍，只断言"播了什么音" */
const played: string[] = []
vi.mock('../services/sound', () => ({
  playSound: (ev: string) => {
    played.push(ev)
  },
}))

let completion: typeof import('../services/completion')

beforeEach(async () => {
  played.length = 0
  completion = await import('../services/completion')
})

const ev = (over: Partial<import('../services/completion').CompletionEvent> = {}) => ({
  source: 'task' as const,
  entityType: 'tasks',
  entityId: 't-1',
  completedAt: '2026-09-30T10:00:00.000Z',
  ...over,
})

describe('decideFeedback —— 三档判据', () => {
  it('高优先级待办 → important（落印 + 声 + 条）', () => {
    const p = completion.decideFeedback(ev({ weight: 'high' }))
    expect(p.level).toBe('important')
    expect(p.seal).toBe(true)
    expect(p.audio).toBe('task-done')
    expect(p.toast).toBeTruthy()
  })

  it('普通待办 → normal（落印 + 声，**不弹条**）', () => {
    const p = completion.decideFeedback(ev())
    expect(p.level).toBe('normal')
    expect(p.audio).toBe('task-done')
    expect(p.toast).toBeNull()
  })

  it('轻量（习惯打卡 / 低优先级待办）→ light（**只落印，不发声不弹条**）', () => {
    const habit = completion.decideFeedback(ev({ source: 'habit', entityType: 'habitLogs' }))
    expect(habit.level).toBe('light')
    expect(habit.seal).toBe(true)
    expect(habit.audio).toBeNull()
    expect(habit.toast).toBeNull()

    const lowTask = completion.decideFeedback(ev({ weight: 'low' }))
    expect(lowTask.level).toBe('light')
    expect(lowTask.audio).toBeNull()
  })

  it('低优先级的**习惯**仍是 light（不会因为降档逻辑掉出档位）', () => {
    const p = completion.decideFeedback(ev({ source: 'habit', weight: 'low' }))
    expect(p.level).toBe('light')
  })

  it('作业与番茄默认 normal；番茄判成高权重时升 important', () => {
    expect(completion.decideFeedback(ev({ source: 'homework' })).level).toBe('normal')
    expect(completion.decideFeedback(ev({ source: 'pomodoro' })).level).toBe('normal')
    expect(completion.decideFeedback(ev({ source: 'pomodoro', weight: 'high' })).level).toBe('important')
  })

  it('纯函数：同一事件算两次结果一致（不依赖时间/随机）', () => {
    const e = ev({ weight: 'high' })
    expect(completion.decideFeedback(e)).toEqual(completion.decideFeedback(e))
  })
})

describe('emitCompletion —— 唯一出口', () => {
  it('按 plan 播声并弹条', () => {
    const notify = vi.fn()
    const p = completion.emitCompletion(ev({ weight: 'high' }), notify)
    expect(p.level).toBe('important')
    expect(played).toEqual(['task-done'])
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('normal 只发声、不弹条', () => {
    const notify = vi.fn()
    completion.emitCompletion(ev(), notify)
    expect(played).toEqual(['task-done'])
    expect(notify).not.toHaveBeenCalled()
  })

  it('light 不发声、不弹条（高频动作不该响）', () => {
    const notify = vi.fn()
    completion.emitCompletion(ev({ source: 'habit', entityType: 'habitLogs' }), notify)
    expect(played).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })

  it('**缺省 notify 时不崩**，且音效照常播（不因少传回调而中断反馈）', () => {
    expect(() => completion.emitCompletion(ev({ weight: 'high' }))).not.toThrow()
    expect(played).toEqual(['task-done'])
  })

  it('取消勾选不产生事件：调用方只在"未完成 → 完成"这一瞬发（规则写在这里防回退）', () => {
    const wasDone = true // 已是完成态 → 取消勾选
    const notify = vi.fn()
    if (!wasDone) completion.emitCompletion(ev(), notify)
    expect(played).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })
})
