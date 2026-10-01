/**
 * 人设（Persona）与长期记忆（Step 4-2 · C1/C2/C3/C9）
 *
 * 规格 §十 要求的四件事逐条钉住：
 *  · 默认 Persona 能加载；
 *  · 自定义 Persona 能保存；
 *  · 重置能恢复；
 *  · **UNKNOWN 不会被自动补全为事实**。
 * 另加两件同样重要的：人设**真的进了提示词**（C3：设置了人设 ≠ 人设生效）、
 * 桌宠语气跟着人设走（D3）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { PERSONA_ID_DEEPSEEK_WHALE_GIRL, defaultWhaleGirlPersona } from '../services/persona/defaults'
import { buildAgentSystemPrompt, pickActivePersona } from '../services/persona/prompt'
import { selectMemories } from '../services/memory/select'
import { voiceFromPersona } from '../services/pet/voice'
import { DEFAULT_VOICE } from '../services/pet/voice'
import { personaRepo } from '../repositories/persona-repo'
import { ensureDefaultPersona, emptyPersona, resetDefaultPersona, usePersonaStore } from '../stores/usePersonaStore'
import { memoryRepo } from '../repositories/persona-repo'
import { makeMemory, useMemoryStore } from '../stores/useMemoryStore'
import type { Memory, Persona } from '../types/entities'

const now = '2026-09-28T10:00:00.000Z'

async function clearAll(): Promise<void> {
  await personaRepo.clear()
  await memoryRepo.clear()
  await usePersonaStore.getState().load()
  await useMemoryStore.getState().load()
}

beforeEach(clearAll)

describe('默认人设（《人设.txt》的忠实落地）', () => {
  const p = defaultWhaleGirlPersona(now)

  it('核心设定一个都不少（自称 / 称呼 / 主食 / 尾鳍 / 禁区）', () => {
    expect(p.selfClaim).toContain('本鲸')
    expect(p.userName).toContain('主人')
    expect(p.likes).toContain('白饭')
    expect(p.appearance).toContain('鲸尾')
    expect(p.forbidden).toContain('蓝色大肥鱼')
    expect(p.forbidden).toContain('胖')
    expect(p.personality).toContain('傲娇')
    expect(p.id).toBe(PERSONA_ID_DEEPSEEK_WHALE_GIRL)
    expect(p.builtin).toBe(true)
  })

  it('UNKNOWN 段落保留原文（不补全）', () => {
    expect(p.unknown).toContain('UNKNOWN_')
    expect(p.unknown).toContain('未知')
    expect(p.unknown).toContain('[推断]')
  })

  it('Agent 五节标明【推导】（不伪装成原文设定）', () => {
    for (const t of [p.agentStyle, p.taskAttitude, p.toolBehavior, p.memoryBehavior, p.proactivity]) {
      expect(t).toContain('【推导】')
    }
  })
})

describe('播种与重置（业务表，跨设备一致）', () => {
  it('首次启动播种默认人设；再启动**不覆盖**用户改过的内容', async () => {
    expect(await ensureDefaultPersona()).toBe(true)
    const saved = usePersonaStore.getState().items.find((x) => x.id === PERSONA_ID_DEEPSEEK_WHALE_GIRL)
    expect(saved?.name).toBeTruthy()

    // 用户改名 → 再启动不得被覆盖
    await usePersonaStore.getState().update(PERSONA_ID_DEEPSEEK_WHALE_GIRL, { name: '我的鲸鱼娘' })
    expect(await ensureDefaultPersona()).toBe(false)
    const after = await personaRepo.get(PERSONA_ID_DEEPSEEK_WHALE_GIRL)
    expect(after?.name).toBe('我的鲸鱼娘')
  })

  it('重置恢复出厂内容（保留 id），改名被抹回', async () => {
    await ensureDefaultPersona()
    await usePersonaStore.getState().update(PERSONA_ID_DEEPSEEK_WHALE_GIRL, {
      name: '改坏了',
      selfClaim: '我',
    })
    expect(await resetDefaultPersona()).toBe(true)
    const back = await personaRepo.get(PERSONA_ID_DEEPSEEK_WHALE_GIRL)
    expect(back?.name).toBe(defaultWhaleGirlPersona(now).name)
    expect(back?.selfClaim).toContain('本鲸')
  })

  it('自定义人设可保存（走 store 工厂，带时间戳）', async () => {
    const custom: Persona = { ...defaultWhaleGirlPersona(now), id: 'mine', name: '工作人格', builtin: undefined }
    expect(await usePersonaStore.getState().save(custom)).toBe(true)
    const rows = await personaRepo.list()
    expect(rows.map((r) => r.id).sort()).toEqual(['mine'])
  })
})

describe('人设进 runtime（C3：设置了人设 ≠ 人设生效）', () => {
  const persona = defaultWhaleGirlPersona(now)

  it('提示词里带上人设各节与纪律', () => {
    const text = buildAgentSystemPrompt(persona, [])
    expect(text).toContain('人设 · DSH 鲸鱼娘')
    expect(text).toContain('自称')
    expect(text).toContain('本鲸')
    expect(text).toContain('未知资料')
  })

  it('**UNKNOWN 不会被当成事实**：原文进提示词，且附加"不得补全"的纪律', () => {
    const text = buildAgentSystemPrompt(persona, [])
    expect(text).toContain('UNKNOWN_')
    expect(text).toContain('不得当作事实陈述')
    expect(text).toContain('不得自行补全')
  })

  it('无人设时退回中性语气（不猜一个）', () => {
    const text = buildAgentSystemPrompt(null, [])
    expect(text).toContain('未选择人设')
    expect(text).not.toContain('本鲸')
  })

  it('记忆只在被选中时进提示词；没选中时给的是纪律而不是"暂无"', () => {
    const mem: Memory = makeMemory('不吃香菜', '饮食')
    const withMem = buildAgentSystemPrompt(persona, [mem])
    expect(withMem).toContain('不吃香菜')
    const without = buildAgentSystemPrompt(persona, [])
    expect(without).toContain('记忆纪律')
    expect(without).not.toContain('暂无')
  })
})

describe('记忆检索（关键词 / 标签 / 时间；不引入向量库）', () => {
  const mk = (id: string, text: string, tags: string[] = [], enabled = true): Memory => ({
    ...makeMemory(text, tags.join(' ')),
    id,
    enabled,
  })

  it('按关键词命中（中文用字符二元组切分）', () => {
    const rows = [mk('a', '不吃香菜'), mk('b', '周三下午有例会')]
    // ⚠️ 这是**关键词级**检索（第一版刻意不引入向量库）：命中要求问法与记忆有共同词素。
    // "今天吃什么"这类泛问取不到"不吃香菜" —— 那是已知边界，不是 bug（见 select.ts 文件头）。
    expect(selectMemories(rows, '我不吃香菜吗').map((m) => m.id)).toEqual(['a'])
    expect(selectMemories(rows, '周三开会吗').map((m) => m.id)).toEqual(['b'])
    expect(selectMemories(rows, '今天天气怎么样')).toEqual([])
  })

  it('标签命中权重更高', () => {
    const rows = [mk('a', '某个事实', ['报销']), mk('b', '报销要贴发票', [])]
    expect(selectMemories(rows, '报销怎么弄')[0]?.id).toBe('a')
  })

  it('停用的不注入；无关的不注入（宁可不给，不硬塞）', () => {
    const rows = [mk('a', '不吃香菜', [], false), mk('b', '周三下午有例会')]
    expect(selectMemories(rows, '今天吃什么')).toEqual([])
  })
})

describe('桌宠语气来自人设（D3：人格决定"怎么表现"）', () => {
  it('从默认人设解析出自称 / 称呼 / 主食', () => {
    const v = voiceFromPersona(defaultWhaleGirlPersona(now))
    expect(v.self).toBe('本鲸')
    expect(v.master).toBe('主人')
    expect(v.food).toBe('白饭')
  })

  it('人设字段写空了 → 逐项回退内置默认（桌宠不会失语）', () => {
    const blank: Persona = { ...defaultWhaleGirlPersona(now), selfClaim: '', userName: '', likes: '' }
    expect(voiceFromPersona(blank)).toEqual(DEFAULT_VOICE)
    expect(voiceFromPersona(null)).toEqual(DEFAULT_VOICE)
  })

  it('用户改成别的自称 → 桌宠台词跟着变', () => {
    const mine: Persona = { ...defaultWhaleGirlPersona(now), selfClaim: '小鲸', userName: '老板' }
    const v = voiceFromPersona(mine)
    expect(v.self).toBe('小鲸')
    expect(v.master).toBe('老板')
  })
})

describe('人设生效链路（Step 4-3 · 四：六个检查点）', () => {
  const whale = defaultWhaleGirlPersona(now)
  const work: Persona = { ...emptyPersona('工作人格'), id: 'work-persona', selfClaim: '在下', userName: '同事' }

  it('① 取当前人设：未选 / 选了但已被删除 → null（不拿别人顶上）', () => {
    expect(pickActivePersona([whale, work], null)).toBeNull()
    expect(pickActivePersona([whale, work], '')).toBeNull()
    expect(pickActivePersona([whale, work], '早就删了')).toBeNull()
    expect(pickActivePersona([whale, work], 'work-persona')?.name).toBe('工作人格')
  })

  it('② 每轮都由同一函数现取 → 切换人设立即生效（无需任何失效通知）', () => {
    const before = buildAgentSystemPrompt(pickActivePersona([whale, work], whale.id), [])
    const after = buildAgentSystemPrompt(pickActivePersona([whale, work], work.id), [])
    expect(before).toContain('DSH 鲸鱼娘')
    expect(before).toContain('本鲸')
    expect(after).toContain('工作人格')
    expect(after).toContain('在下')
    expect(after).not.toContain('本鲸')
  })

  it('③ 人设与记忆各占一段，互不覆盖（记忆不会盖掉人设，反过来也一样）', () => {
    const mem: Memory = makeMemory('主人不吃香菜', '饮食')
    const text = buildAgentSystemPrompt(whale, [mem])
    expect(text).toContain('【人设 · DSH 鲸鱼娘】')
    expect(text).toContain('【长期记忆')
    expect(text.indexOf('【人设')).toBeLessThan(text.indexOf('【长期记忆'))
    expect(text).toContain('主人不吃香菜')
  })

  it('④ **人设不得覆盖安全规则**（"绝对服从"只作用于语气与配合度）', () => {
    const text = buildAgentSystemPrompt(whale, [])
    expect(text).toContain('不覆盖安全规则')
    expect(text).toContain('一律拒绝')
  })

  it('⑤ **人设不得修改事实数据**：真数据只有一处来源，其余不许编', () => {
    const text = buildAgentSystemPrompt(whale, [])
    expect(text).toContain('只有随消息给出的数据上下文里的数字与日期是真数据')
    expect(text).toContain('不要编造')
  })

  it('⑥ 未知资料一律保持 UNKNOWN，且检索不到时如实说（不假装记得）', () => {
    const text = buildAgentSystemPrompt(whale, [])
    expect(text).toContain('UNKNOWN')
    expect(text).toContain('不得自行补全')
    expect(text).toContain('如实说没有找到相关记忆')
    expect(text).toContain('禁止假装记得')
  })

  it('重置默认人设会把内容抹回出厂（且保留 id 与创建时间）', async () => {
    await ensureDefaultPersona()
    const created = (await personaRepo.get(PERSONA_ID_DEEPSEEK_WHALE_GIRL))?.createdAt
    await usePersonaStore.getState().update(PERSONA_ID_DEEPSEEK_WHALE_GIRL, { selfClaim: '我', userName: '你' })
    expect(await resetDefaultPersona()).toBe(true)
    const back = await personaRepo.get(PERSONA_ID_DEEPSEEK_WHALE_GIRL)
    expect(back?.selfClaim).toContain('本鲸')
    expect(back?.id).toBe(PERSONA_ID_DEEPSEEK_WHALE_GIRL)
    expect(back?.createdAt).toBe(created)
  })
})