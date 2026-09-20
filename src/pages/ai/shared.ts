/**
 * 术 · 页面专属常量与表单类型
 */
import { Bot, Box, Cpu, FileText, Hammer, Plug, Sparkles, Workflow } from 'lucide-react'

/** 类型展示图标（按类型名查表；用户新建的类型没有专属图标，用 Box 兜底） */
const TYPE_ICON: Record<string, typeof Bot> = {
  模型: Cpu,
  Tool: Hammer,
  Skill: Sparkles,
  Agent: Bot,
  Plugin: Plug,
  Prompt: FileText,
  Workflow: Workflow,
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
