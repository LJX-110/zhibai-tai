/**
 * 长期记忆的**写入闭环**（Step 4-3 · 三）
 *
 * 规格要求的四件事逐条钉住：
 *  · 对话里能提出记忆 → 用户确认 → 写入 `memories`（`source: 'agent'`，可区分来源）；
 *  · **不偷偷写**：未经确认的调用不会碰库；
 *  · 已有等义记忆时不再添加（避免每次聊天都弹同一张卡）；
 *  · 保存后**可被检索命中**，停用 / 删除后不再注入。
 *
 * 记忆是业务表（随加密快照跨设备同步），所以这里走真实 repo，不用内存替身。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { agentToolById } from '../components/ai/plugins'
import { selectMemories } from '../services/memory/select'
import { runAgent } from '../services/agent/loop'
import { resumeWithResult } from '../services/agent/loop'
import { memoryRepo } from '../repositories/persona-repo'
import { makeMemory, useMemoryStore } from '../stores/useMemoryStore'
import type { Memory } from '../types/entities'

async function clearAll(): Promise<void> {
  await memoryRepo.clear()
  await useMemoryStore.getState().load()
}

beforeEach(clearAll)

/** 取真实的 `memory.save`（这条链的关键是"用的是注册表里那一个"，不是测试自造的替身） */
function memorySave() {
  const tool = agentToolById('memory.save')
  if (!tool) throw new Error('memory.save 没有注册进工具表')
  return tool
}

async function rows(): Promise<Memory[]> {
  return memoryRepo.list()
}

describe('memory.save 工具的申报', () => {
  it('是 requires-confirmation，且给出人话摘要（用户不可能读懂一段 JSON）', () => {
    const t = memorySave()
    expect(t.mode).toBe('requires-confirmation')
    expect(t.requiresConfirmation).toBe(true)
    expect(t.confirmSummary?.({ text: '主人不吃香菜' })).toBe('主人不吃香菜')
  })

  it('摘要兜底：没给正文时也不会渲染成空白', () => {
    expect(memorySave().confirmSummary?.({})).toBe('（没有内容）')
  })
})

describe('确认后写入', () => {
  it('执行一次 → 落库一条，来源标为 agent', async () => {
    const r = await memorySave().execute({ text: '主人不吃香菜', tags: '饮食 忌口' })
    expect(r.count).toBe(1)
    const list = await rows()
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('主人不吃香菜')
    expect(list[0].source).toBe('agent')
    // 标签按空格拆开（与设置页的手动录入同一口径）
    expect(list[0].tags).toEqual(['饮食', '忌口'])
    expect(list[0].enabled).toBe(true)
  })

  it('**等义内容不再重复添加**（否则每次聊天都会弹同一张卡）', async () => {
    await memorySave().execute({ text: '主人不吃香菜' })
    const again = await memorySave().execute({ text: '主人不吃香菜。' })
    expect(again.count).toBe(0)
    expect(await rows()).toHaveLength(1)
  })

  it('缺正文直接失败（宁可报错，也不要写一条空记忆）', async () => {
    await expect(memorySave().execute({})).rejects.toThrow(/缺少 text/)
    expect(await rows()).toHaveLength(0)
  })

  it('保存后**能被检索命中**（关键词检索，不引入向量库）', async () => {
    await memorySave().execute({ text: '主人不吃香菜', tags: '饮食' })
    await useMemoryStore.getState().load()
    const items = useMemoryStore.getState().items
    expect(selectMemories(items, '我不吃香菜吗').map((m) => m.text)).toEqual(['主人不吃香菜'])
  })

  it('停用后不注入；删除后不可检索', async () => {
    await memorySave().execute({ text: '主人不吃香菜' })
    await useMemoryStore.getState().load()
    const row = useMemoryStore.getState().items[0]

    await useMemoryStore.getState().update(row.id, { enabled: false })
    await useMemoryStore.getState().load()
    expect(selectMemories(useMemoryStore.getState().items, '我不吃香菜吗')).toEqual([])

    await useMemoryStore.getState().remove(row.id)
    await useMemoryStore.getState().load()
    expect(useMemoryStore.getState().items).toEqual([])
  })
})

describe('端到端：Agent 提议 → 确认 → 写入 → 续跑', () => {
  it('未经确认时库里没有任何变化；确认后才落库并被回喂给模型', async () => {
    const calls: string[] = []
    const complete = async (input: string) => {
      calls.push(input)
      if (calls.length === 1) {
        return '我建议记住这件事。\n```json\n{"tool":"memory.save","args":{"text":"主人不吃香菜"}}\n```'
      }
      return '好，记下了。'
    }

    // ① 提问 → 停在提案上（**没有写库**）
    const first = await runAgent({ question: '记一下我不吃香菜', tools: [memorySave()], complete })
    expect(first.reason).toBe('needs-confirmation')
    expect(await rows()).toHaveLength(0)

    // ② 用户点确认 → 执行 → 续跑
    const result = await memorySave().execute(first.proposal!.args)
    const second = await runAgent({
      question: '记一下我不吃香菜',
      tools: [memorySave()],
      complete,
      seed: resumeWithResult(first.resume!, 'memory.save', result),
    })

    expect(second.reason).toBe('done')
    expect(await rows()).toHaveLength(1)
    // 续跑那一步的输入里带着"已记住"—— 模型据此收尾，而不是假装自己记了
    // （第 0 次是第一轮推演，第 1 次是续跑后的那一轮）
    expect(calls[1]).toContain('已记住')
  })

  it('取消（不执行）时库仍然是空的', async () => {
    const first = await runAgent({
      question: '记一下',
      tools: [memorySave()],
      complete: async () => '```json\n{"tool":"memory.save","args":{"text":"某事"}}\n```',
    })
    expect(first.reason).toBe('needs-confirmation')
    expect(await rows()).toHaveLength(0)
  })
})

describe('与设置页手动添加的记忆共用一张表', () => {
  it('用户手写的（user）与天机提议的（agent）都在同一张表里，检索一视同仁', async () => {
    await useMemoryStore.getState().save(makeMemory('周三下午有例会', '日程'))
    await memorySave().execute({ text: '主人不吃香菜', tags: '饮食' })
    await useMemoryStore.getState().load()
    const items = useMemoryStore.getState().items
    expect(items.map((m) => m.source).sort()).toEqual(['agent', 'user'])
    expect(selectMemories(items, '周三开会吗').map((m) => m.text)).toEqual(['周三下午有例会'])
  })
})
