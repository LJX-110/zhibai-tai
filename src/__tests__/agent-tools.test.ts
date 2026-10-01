/**
 * 工具契约（Step 4-3 · 一）—— **纯函数单测**
 *
 * 这一组存在的理由，就是 Step 4-2 报告里那个矛盾："天机有 7 个只读工具"，
 * 而工具表里有 `tasks.create` / `notes.create`。根因是"能不能自动执行"由
 * 一个**独立布尔**表达，与 `riskLevel` 各说各话。
 *
 * 现在 `mode` 是第一维、`requiresConfirmation` 由它派生，本文件把这条不变量钉死：
 *  · `requiresConfirmation` 恒等于 `mode === 'requires-confirmation'`；
 *  · `riskLevel` 必须落在该 mode 的允许集合内；
 *  · 提示词里两类工具**分两段**列（模型必须知道调了会不会立刻生效）。
 */
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_RISK,
  TOOL_MODE_LABEL,
  confirmationTools,
  defineTool,
  describeTools,
  executableTools,
  toolById,
  toolRunsAutomatically,
  toolConsistencyError,
  type AgentTool,
  type ToolMode,
  type ToolRisk,
} from '../services/agent/tools'

const spec = (mode: ToolMode, riskLevel: ToolRisk) => ({
  id: `${mode}.${riskLevel}`,
  name: '示例',
  description: '一个用来验证契约的示例工具',
  inputSchema: { a: '参数' },
  mode,
  riskLevel,
  execute: async () => ({ text: 'ok' }),
})

describe('defineTool：requiresConfirmation 由 mode 派生', () => {
  it('三种 mode 各自派生正确', () => {
    expect(defineTool(spec('read', 'read')).requiresConfirmation).toBe(false)
    expect(defineTool(spec('read', 'search')).requiresConfirmation).toBe(false)
    expect(defineTool(spec('safe-write', 'create')).requiresConfirmation).toBe(false)
    expect(defineTool(spec('requires-confirmation', 'sensitive')).requiresConfirmation).toBe(true)
    expect(defineTool(spec('requires-confirmation', 'destructive')).requiresConfirmation).toBe(true)
  })

  it('只有 requires-confirmation 需要确认（其余可直接执行）', () => {
    expect(toolRunsAutomatically('read')).toBe(true)
    expect(toolRunsAutomatically('safe-write')).toBe(true)
    expect(toolRunsAutomatically('requires-confirmation')).toBe(false)
  })

  it('三个 mode 都有中文名（设置页与提示词共用一份，不各自写）', () => {
    for (const m of ['read', 'safe-write', 'requires-confirmation'] as ToolMode[]) {
      expect(TOOL_MODE_LABEL[m]).toBeTruthy()
    }
  })
})

describe('toolConsistencyError：矛盾必须能被机器发现', () => {
  it('合规的工具返回 null', () => {
    for (const [mode, risks] of Object.entries(ALLOWED_RISK)) {
      for (const r of risks) {
        expect(toolConsistencyError({ ...defineTool(spec(mode as ToolMode, r)), id: `${mode}-${r}` })).toBeNull()
      }
    }
  })

  it('布尔与 mode 不一致 → 报错（这正是上一版报告的病灶）', () => {
    const bad = { id: 'x', mode: 'read' as ToolMode, riskLevel: 'read' as ToolRisk, requiresConfirmation: true }
    expect(toolConsistencyError(bad)).toContain('requiresConfirmation 与 mode 不一致')
  })

  it('**说是只读、实际会写** 也能被拦下（riskLevel 不在该 mode 的允许集合）', () => {
    const bad = { id: 'x', mode: 'read' as ToolMode, riskLevel: 'create' as ToolRisk, requiresConfirmation: false }
    expect(toolConsistencyError(bad)).toContain('不属于 mode=read')
  })

  it('需确认的工具不能标成 read（否则会被当只读展示）', () => {
    const bad = {
      id: 'x',
      mode: 'requires-confirmation' as ToolMode,
      riskLevel: 'read' as ToolRisk,
      requiresConfirmation: true,
    }
    expect(toolConsistencyError(bad)).toContain('不属于 mode=requires-confirmation')
  })
})

describe('分组与查找', () => {
  const tools: AgentTool[] = [
    defineTool({ ...spec('read', 'search'), id: 'a' }),
    defineTool({ ...spec('safe-write', 'create'), id: 'b' }),
    defineTool({ ...spec('requires-confirmation', 'sensitive'), id: 'c' }),
  ]

  it('两组刚好分完，不重不漏', () => {
    expect(executableTools(tools).map((t) => t.id)).toEqual(['a', 'b'])
    expect(confirmationTools(tools).map((t) => t.id)).toEqual(['c'])
  })

  it('按 id 查得到；查不到返回 undefined（调用方必须如实报，不许猜）', () => {
    expect(toolById(tools, 'c')?.id).toBe('c')
    expect(toolById(tools, 'zzz')).toBeUndefined()
  })
})

describe('describeTools：两段分开列给模型看', () => {
  const tools: AgentTool[] = [
    defineTool({ ...spec('read', 'search'), id: 'tasks.search', name: '查待办' }),
    defineTool({ ...spec('requires-confirmation', 'sensitive'), id: 'memory.save', name: '记住这件事' }),
  ]
  const text = describeTools(tools)

  it('可执行的进【可用工具】段，需确认的单独成段并写明"不会立刻生效"', () => {
    expect(text).toContain('【可用工具（调用后立即执行，结果会回给你）】')
    expect(text).toContain('【需要主人确认的工具')
    expect(text).toContain('tasks.search')
    expect(text).toContain('memory.save')
    expect(text).toContain('不要说"已经做好了"')
  })

  it('只有可执行工具时，不出现"需要确认"那一段（不留空标题）', () => {
    const only = describeTools([tools[0]])
    expect(only).toContain('tasks.search')
    expect(only).not.toContain('需要主人确认')
  })

  it('工具为空 → 空串（不产生空标题块）', () => {
    expect(describeTools([])).toBe('')
  })
})
