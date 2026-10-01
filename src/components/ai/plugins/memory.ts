/**
 * 核心 · 插件 —— 长期记忆的**写入提议**（Step 4-3 · 三）
 *
 * ## 它解决的缺口
 * `memories` 表与检索（`services/memory/select.ts`）在 Step 4-2 就已就位，
 * 设置页也能手动增删改 —— 但**对话里没有任何一条路能把"值得记住的事"变成记忆**。
 * 结果是天机要么完全记不住，要么（更糟）模型自行在回答里说"我记住了"，
 * 而库里什么都没有 —— 用户下一次问，它就答不上来。
 *
 * ## 为什么必须是 `requires-confirmation`
 * 记忆会**长期改变它之后每一次的回答**，属于"错了很难发现"的一类写入。
 * 所以模型只能**提议**：调用 `memory.save` 会生成一张轻量确认卡片，
 * 主人点「记住」才落库，点「不用」则原样丢弃（`services/agent/tools.ts` 的确认门）。
 *
 * ## 三条纪律（写进工具说明，因为模型只会读那里）
 *  ① 普通闲聊**不记**；只有主人明确说"记住…"或同一偏好反复出现时才提议；
 *  ② 记忆正文是**一句可独立成立的事实**（"主人不吃香菜"），不是一段对话摘抄；
 *  ③ 库里已有同义内容时**不再提议**（避免每次聊天都弹同一张卡）。
 */
import { defineTool } from '../../../services/agent/tools'
import { makeMemory, useMemoryStore } from '../../../stores/useMemoryStore'
import type { Memory } from '../../../types/entities'
import type { TianjiPlugin } from './index'

/** 归一化：去空白、去标点，用于"是不是已经记过同一条"的判断 */
function normalize(text: string): string {
  return text.replace(/[\s，。、！？,.!?]/g, '').toLowerCase()
}

/** 从参数里取正文与标签 */
function fieldsOf(args: Record<string, unknown>): { text: string; tags: string } {
  const text = typeof args.text === 'string' ? args.text.trim() : ''
  const rawTags = args.tags
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === 'string').join(' ')
    : typeof rawTags === 'string'
      ? rawTags
      : ''
  return { text, tags }
}

/** 是否已有等义记忆（含被停用的 —— 停用只是"不注入"，不代表可以重复建一条） */
function alreadyRemembered(items: readonly Memory[], text: string): boolean {
  const key = normalize(text)
  if (!key) return true
  return items.some((m) => normalize(m.text) === key)
}

export const memoryPlugin: TianjiPlugin = {
  id: 'core',

  tools: [
    defineTool({
      id: 'memory.save',
      name: '记住这件事',
      description:
        '**提议**把一条长期有效的事实记进主人的长期记忆（如"主人不吃香菜""主人每周三下午有例会"）。' +
        '调用后不会立刻写入，会生成一张确认卡片，主人点确认才生效。' +
        '只在两种情况提议：① 主人明确说"记住…/以后都…"；② 同一偏好已经反复出现。' +
        '**普通闲聊、一次性信息、临时安排（"明天下午交作业"）不要提议** —— 那些属于待办，用 tasks.create。',
      inputSchema: {
        text: '要记住的一句话事实（必填；写成可独立成立的短句，不要摘抄整段对话）',
        tags: '检索标签，空格分隔（可选，如「饮食 忌口」）',
      },
      mode: 'requires-confirmation',
      riskLevel: 'sensitive',
      confirmSummary: (args) => fieldsOf(args).text || '（没有内容）',
      execute: async (args) => {
        const { text, tags } = fieldsOf(args)
        if (!text) throw new Error('缺少 text：不知道要记住什么')
        const store = useMemoryStore.getState()
        if (alreadyRemembered(store.items, text)) {
          return { count: 0, text: `这条已经在长期记忆里了，没有重复添加：「${text}」。` }
        }
        const ok = await store.save(makeMemory(text, tags, 'agent'))
        if (!ok) throw new Error('写入长期记忆失败（存储不可用）')
        return { count: 1, text: `已记住：「${text}」${tags ? `（标签：${tags}）` : ''}。` }
      },
    }),
  ],
}
