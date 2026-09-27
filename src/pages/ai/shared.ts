/**
 * 术 · 页面专属常量与表单类型
 */
import { Bot, Box, Cpu, FileText, Hammer, Plug, Sparkles, Workflow } from 'lucide-react'

/**
 * 类型展示图标（按类型名查表；用户新建的类型没有专属图标，用 Box 兜底）。
 *
 * ⚠️ **中英两套 key 都要留**：内置类型名已改为中文（见 `services/categories.ts`），
 * 但老用户的分类是他们库里的**数据**（英文名）—— 删掉英文 key 会让他们的类型
 * 退化成兜底图标（看起来像"数据坏了"，实际是我们少了一行映射）。
 */
const TYPE_ICON: Record<string, typeof Bot> = {
  模型: Cpu,
  工具: Hammer,
  技能: Sparkles,
  智能体: Bot,
  插件: Plug,
  提示词: FileText,
  工作流: Workflow,
  // 兼容：内置类型改名前的旧名
  Tool: Hammer,
  Skill: Sparkles,
  Agent: Bot,
  Plugin: Plug,
  Prompt: FileText,
}

export const typeIcon = (t: string) => TYPE_ICON[t] ?? Box

export interface AiFormState {
  name: string
  type: string
  provider: string
  description: string
  tags: string
  config: string
}

export const EMPTY_AI_FORM: AiFormState = {
  name: '',
  type: '模型',
  provider: '',
  description: '',
  tags: '',
  config: '',
}
