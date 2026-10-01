/**
 * Agent · 工具（Tool）契约 —— **纯类型与纯函数**，不认识任何具体板块（Step 4-2 · C4 / Step 4-3 · A）
 *
 * ## 与「动作协议」的分工（别混，这是安全边界）
 * | | 工具（本文件） | 动作（`components/ai/action-protocol.ts`） |
 * | --- | --- | --- |
 * | 谁能执行 | READ / SAFE_WRITE 由 Agent Loop 自动执行 | 只有用户点确认后才落库 |
 * | 典型风险 | 查询、检索、低风险新建 | 涉及金额、批量、删除 |
 * | 结果 | 回喂给模型继续推理 | 直接落库并向用户回执 |
 *
 * ## Step 4-3 · 一：ToolMode —— 三档执行语义（本轮的**核心修正**）
 * Step 4-2 的报告里写着"天机有 7 个只读工具"，但列表里明明白白有 `tasks.create` /
 * `notes.create` —— 说明当时只有 `riskLevel`（read / search / create）一个维度，
 * 而"能不能自动执行"是用一个**独立布尔** `requiresConfirmation` 表达的。
 * 两个维度各说各话，就一定会出现"说只读、实际会写"这种自相矛盾。
 *
 * 现在把"能不能自己动手"提成**第一维**，并且**由它派生**那个布尔：
 *
 * | `mode` | 含义 | 执行方式 | 允许的 `riskLevel` |
 * | --- | --- | --- | --- |
 * | `read` | 只读 / 检索 | Agent Loop 直接执行 | `read` · `search` |
 * | `safe-write` | 低风险新建（重放也安全） | Agent Loop 直接执行 | `create` |
 * | `requires-confirmation` | 需用户确认 | **不进自动执行**：先生成 proposal，主人点确认才执行 | `sensitive` · `destructive` |
 *
 * ⚠️ `requiresConfirmation` **不由插件手写** —— 它由 `defineTool` 从 `mode` 派生。
 * 手写就会出现"mode 说要确认、布尔说不用"这种矛盾，而这正是上一版报告出错的原因。
 * 一致性由 `toolConsistencyError()` 机械可查（`agent-tools.test.ts` 全量断言）。
 *
 * ## 一条经验
 * **能自动执行的事必须是"重放也安全"的** —— 查询天然安全；建一条笔记重复两次只是多一条，
 * 而"转 100 元"重复两次是事故。所以 `safe-write` 的准入线是"重放代价可忽略"。
 *
 * ## 为什么工具要申报 `description` 与 `inputSchema`
 * 模型只能看到文本，工具的可发现性完全靠这两项。写"这个工具做什么、参数长什么样、
 * 什么时候该用" —— 它决定模型会不会正确使用（写成"查询任务"必然被滥用）。
 */

/** 工具执行结果：`text` 会被拼回提示词（**给模型看的**，不是给用户看的 UI 文案） */
export interface ToolResult {
  /** 回喂给模型的文本（简明事实，如 "3 条：报销（逾期）、周报…"） */
  text: string
  /** 命中的条目数（可选；用于 UI 显示"查到 N 条"） */
  count?: number
}

/**
 * **执行语义**（第一维，决定"Agent 能不能自己动手"）。
 * 加新工具时先回答这个问题，再谈其它。
 */
export type ToolMode = 'read' | 'safe-write' | 'requires-confirmation'

/**
 * **数据影响面**（第二维，用于设置页展示与人工评审）。
 * 取值与 `mode` 有固定对应关系（见 `ALLOWED_RISK`），不自由组合。
 */
export type ToolRisk = 'read' | 'search' | 'create' | 'sensitive' | 'destructive'

/** 每个 mode 允许的 riskLevel（机械可查的一致性判据） */
export const ALLOWED_RISK: Record<ToolMode, readonly ToolRisk[]> = {
  read: ['read', 'search'],
  'safe-write': ['create'],
  'requires-confirmation': ['sensitive', 'destructive'],
}

/** mode 的中文名（设置页与提示词共用一份，避免两处措辞漂移） */
export const TOOL_MODE_LABEL: Record<ToolMode, string> = {
  read: '只读',
  'safe-write': '可自动新建',
  'requires-confirmation': '需你确认',
}

/** 模型能否直接调用（`read` 与 `safe-write` 可以；`requires-confirmation` 只能提议） */
export function toolRunsAutomatically(mode: ToolMode): boolean {
  return mode !== 'requires-confirmation'
}

/** 插件申报工具时的形状（**不含** `requiresConfirmation` —— 它由 mode 派生） */
export interface AgentToolSpec {
  /** 全局唯一 id（插件前缀 + 动作，如 `tasks.search`）—— 模型写的就是它 */
  id: string
  /** 中文名（设置页「天机可以做什么」用） */
  name: string
  /** 给模型看的说明：做什么 + 参数 + 何时用 */
  description: string
  /** 参数规格（键 → 人话说明；`?` 结尾表示可选）—— 直接进提示词 */
  inputSchema: Record<string, string>
  mode: ToolMode
  riskLevel: ToolRisk
  /** 执行（一律走 store 工厂，绝不直接碰 Dexie） */
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
  /**
   * `requires-confirmation` 专用：一句"它想做什么"，用于确认卡片正文。
   * 其余模式不需要（它们没有确认这一步）。
   */
  confirmSummary?: (args: Record<string, unknown>) => string
}

/** 注册表里实际存放的工具（`requiresConfirmation` 已由 `defineTool` 派生） */
export interface AgentTool extends AgentToolSpec {
  /** ⚠️ 派生字段，不要手写 —— 它恒等于 `mode === 'requires-confirmation'` */
  requiresConfirmation: boolean
}

/** 申报一个工具：`requiresConfirmation` 从 `mode` 派生，杜绝两者互相矛盾 */
export function defineTool(spec: AgentToolSpec): AgentTool {
  return { ...spec, requiresConfirmation: spec.mode === 'requires-confirmation' }
}

/**
 * 一致性判据：返回错误说明，合规返回 null。
 *
 * 两件事：① `requiresConfirmation` 必须与 `mode` 一致；② `riskLevel` 必须落在该 mode 的允许集合内。
 */
export function toolConsistencyError(tool: {
  id: string
  mode: ToolMode
  riskLevel: ToolRisk
  requiresConfirmation: boolean
}): string | null {
  if (tool.requiresConfirmation !== (tool.mode === 'requires-confirmation')) {
    return `${tool.id}：requiresConfirmation 与 mode 不一致（mode=${tool.mode}）`
  }
  if (!ALLOWED_RISK[tool.mode].includes(tool.riskLevel)) {
    return `${tool.id}：riskLevel=${tool.riskLevel} 不属于 mode=${tool.mode} 的允许集合（${ALLOWED_RISK[tool.mode].join(' / ')}）`
  }
  return null
}

/** 供提示词使用的工具清单（只描述**可自动执行**的工具） */
export function executableTools(tools: readonly AgentTool[]): AgentTool[] {
  return tools.filter((t) => !t.requiresConfirmation)
}

/** 需要用户确认的工具（它们只能被"提议"，由面板渲染确认卡片） */
export function confirmationTools(tools: readonly AgentTool[]): AgentTool[] {
  return tools.filter((t) => t.requiresConfirmation)
}

/** 按 id 取工具（确认后执行的入口；找不到返回 undefined，调用方如实报错而不是猜） */
export function toolById(tools: readonly AgentTool[], id: string): AgentTool | undefined {
  return tools.find((t) => t.id === id)
}

/** 单条工具 → 提示词里的一行 */
function describeOne(t: AgentTool, hint: string): string {
  const params = Object.entries(t.inputSchema)
    .map(([k, v]) => `    ${k}：${v}`)
    .join('\n')
  return `· ${t.id}（${t.name}）——${hint}\n  ${t.description}${params ? `\n  参数：\n${params}` : '\n  参数：无'}`
}

/**
 * 工具清单 → 提示词里的说明块（纯函数，可单测）。
 *
 * **两段分开列**：可自动执行的与必须请主人确认的。这不只是排版 ——
 * 模型必须知道"调了它会不会立刻生效"，否则它会把"我记下了"说成既成事实。
 *
 * 只写 id / 说明 / 参数 —— 不写实现细节，那是给模型的输入而不是文档。
 */
export function describeTools(tools: readonly AgentTool[]): string {
  const auto = executableTools(tools)
  const needConfirm = confirmationTools(tools)
  const parts: string[] = []

  if (auto.length > 0) {
    parts.push(
      `【可用工具（调用后立即执行，结果会回给你）】\n${auto.map((t) => describeOne(t, '可直接执行')).join('\n')}`,
    )
  }
  if (needConfirm.length > 0) {
    parts.push(
      `【需要主人确认的工具（调用后**不会立刻生效**，只会生成一张确认卡片）】\n` +
        needConfirm.map((t) => describeOne(t, '调用后等主人点确认')).join('\n') +
        '\n这些工具你可以调用，但不要说"已经做好了" —— 要说"我建议…，等你点一下确认"。',
    )
  }
  return parts.join('\n\n')
}
