/**
 * 固定任务的历史重复 —— 判定与清理
 *
 * 这是**每周复发类 bug** 的回归锁。旧版完成固定任务会生成后继副本，而"本期已做"只看
 * `completedAt` 落在哪个周期，于是上周完成的旧副本每周重新出现，一周多一条。
 * 生成逻辑已堵住，展示层改为只认"在世记录"，这里把两件事都钉死：
 *  ① `liveFixedTasks` 只留最新那条（历史副本不再进固定区）；
 *  ② 清理只删**已完成的**旧副本 —— 未完成的可能是用户真的还没做的事，删掉等于抹掉待办。
 */
import { describe, expect, it } from 'vitest'
import {
  findDuplicateFixedTasks,
  fixedTaskIdentity,
  liveFixedTasks,
} from '../utils/id'
import { previewDuplicateFixedTasks, cleanupDuplicateFixedTasks } from '../services/task-repair'
import { useTaskStore } from '../stores/useTaskStore'
import type { Task } from '../types/entities'

const task = (over: Partial<Task>): Task =>
  ({
    id: 't',
    title: '复盘',
    description: '',
    done: false,
    priority: 'mid',
    dueDate: null,
    tags: [],
    repeat: 'none',
    monthlyDay: null,
    weeklyDay: null,
    projectId: null,
    courseId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedAt: null,
    ...over,
  }) as Task

/** 最新那条（旧副本的 id 用 a/b/c，按 createdAt 递增） */
const weekly = (id: string, createdAt: string, done: boolean) =>
  task({ id, title: '周日复盘', repeat: 'weekly', weeklyDay: 0, createdAt, done, completedAt: done ? createdAt : null })

describe('固定任务身份 fixedTaskIdentity', () => {
  it('同一锚点 + 同一标题 = 同一件事；锚点或标题不同就是两件事', () => {
    const a = weekly('a', '2026-09-01T00:00:00.000Z', true)
    const b = weekly('b', '2026-09-08T00:00:00.000Z', false)
    expect(fixedTaskIdentity(a)).toBe(fixedTaskIdentity(b))

    expect(fixedTaskIdentity(a)).not.toBe(
      fixedTaskIdentity(task({ repeat: 'weekly', weeklyDay: 3, title: '周日复盘' })),
    )
    expect(fixedTaskIdentity(a)).not.toBe(
      fixedTaskIdentity(task({ repeat: 'weekly', weeklyDay: 0, title: '周一复盘' })),
    )
  })
})

describe('在世记录 liveFixedTasks', () => {
  it('每周复发场景：旧副本退场，只留最新那条', () => {
    const a = weekly('a', '2026-09-01T00:00:00.000Z', true) // 第 1 周完成
    const b = weekly('b', '2026-09-08T00:00:00.000Z', false) // 完成后生成的副本
    const live = liveFixedTasks([a, b])
    expect(live.map((t) => t.id)).toEqual(['b'])
  })

  it('副本链条再长也只留最新（第 3 周不再 A+B+C 一起冒出来）', () => {
    const a = weekly('a', '2026-09-01T00:00:00.000Z', true)
    const b = weekly('b', '2026-09-08T00:00:00.000Z', true)
    const c = weekly('c', '2026-09-15T00:00:00.000Z', false)
    expect(liveFixedTasks([a, b, c]).map((t) => t.id)).toEqual(['c'])
  })

  it('非固定任务原样保留（它们本来就是一条记录对应一次完成）', () => {
    const plain = task({ id: 'p', title: '买牛奶', repeat: 'none' })
    const other = task({ id: 'q', title: '交话费', repeat: 'monthly', monthlyDay: 27 })
    expect(liveFixedTasks([plain, other]).map((t) => t.id)).toEqual(['p', 'q'])
  })

  it('只输入顺序颠倒也能取到最新（不依赖入参顺序）', () => {
    const a = weekly('a', '2026-09-01T00:00:00.000Z', true)
    const b = weekly('b', '2026-09-08T00:00:00.000Z', false)
    expect(liveFixedTasks([b, a]).map((t) => t.id)).toEqual(['b'])
  })
})

describe('重复识别 findDuplicateFixedTasks', () => {
  it('只把已完成的旧副本列为可删 —— 未完成的可能是真的还没做', () => {
    const a = weekly('a', '2026-09-01T00:00:00.000Z', true)
    const b = weekly('b', '2026-09-08T00:00:00.000Z', true)
    const c = weekly('c', '2026-09-15T00:00:00.000Z', false)
    const groups = findDuplicateFixedTasks([a, b, c])
    expect(groups).toHaveLength(1)
    expect(groups[0].removable.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('旧副本若未完成，不列为可删（宁可少清，不可误删）', () => {
    const a = weekly('a', '2026-09-01T00:00:00.000Z', false)
    const b = weekly('b', '2026-09-08T00:00:00.000Z', false)
    expect(findDuplicateFixedTasks([a, b])).toEqual([])
  })

  it('没有重复时返回空（幂等：清理过再跑不会有动作）', () => {
    expect(findDuplicateFixedTasks([weekly('a', '2026-09-01T00:00:00.000Z', true)])).toEqual([])
  })
})

describe('预览与执行', () => {
  it('previewDuplicateFixedTasks 只算不写库', () => {
    const a = weekly('a', '2026-09-01T00:00:00.000Z', true)
    const b = weekly('b', '2026-09-08T00:00:00.000Z', true)
    const c = weekly('c', '2026-09-15T00:00:00.000Z', false)
    const p = previewDuplicateFixedTasks([a, b, c])
    expect(p).toEqual({ removable: 2, groups: 1, titles: ['周日复盘'] })
  })

  it('cleanupDuplicateFixedTasks 真的删掉旧副本、保留最新与非固定任务', async () => {
    const a = weekly('dup-a', '2026-09-01T00:00:00.000Z', true)
    const b = weekly('dup-b', '2026-09-08T00:00:00.000Z', true)
    const c = weekly('dup-c', '2026-09-15T00:00:00.000Z', false)
    const plain = task({ id: 'dup-plain', title: '独立待办', repeat: 'none' })
    for (const t of [a, b, c, plain]) await useTaskStore.getState().add(t)

    const { removed, groups } = await cleanupDuplicateFixedTasks()
    expect(removed).toBe(2)
    expect(groups).toBe(1)

    const ids = useTaskStore.getState().items.map((t) => t.id)
    expect(ids).toContain('dup-c') // 最新那条保留
    expect(ids).toContain('dup-plain') // 非固定任务不受影响
    expect(ids).not.toContain('dup-a')
    expect(ids).not.toContain('dup-b')

    // 幂等：再跑一次无事发生
    expect(await cleanupDuplicateFixedTasks()).toEqual({ removed: 0, groups: 0 })
    // store 是模块级单例：本用例写入的数据自行清干净，不留给其他文件
    for (const id of ['dup-c', 'dup-plain']) await useTaskStore.getState().remove(id)
  })
})
