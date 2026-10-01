/**
 * 行 · 插件 —— 待办与笔记：**工具（可自动执行）+ 明细**
 *
 * ## Step 4-3 · 二：为什么这里**不再**申报 `create_task` / `create_note` 动作
 * 上一版同时留着两条路：工具（`tasks.create` / `notes.create`，Agent 直接执行）
 * 与动作（模型提议、用户点确认后才落库）。后果是模型两边都能选，
 * 而它经常选到动作那条 —— 于是"帮我记一下明天交作业"得到的回答是
 * "下面有一个 action JSON，请主人自己确认"，而不是**直接记上**。
 *
 * 建一条待办/笔记的重放代价可忽略（重复两次只是多一条），所以它属于
 * `mode: 'safe-write'`，**就该让 Agent 一次做完**。动作这条路留给真正需要
 * 预览确认的写入（如金额 —— 见 `finance.tsx` 的 `create_finance`）。
 *
 * 归属与安全梯度的权威说明见 `services/agent/tools.ts` 的文件头。
 */
import { createId, nowISO, diffDays, effectiveDone, liveFixedTasks } from '../../../utils/id'
import { useTaskStore } from '../../../stores/useTaskStore'
import { useNoteStore } from '../../../stores/useNoteStore'
import { defineTool } from '../../../services/agent/tools'
import type { TianjiPlugin } from './index'

/** 优先级的显示名（与 `components/task/shared.ts` 同义；插件不跨域 import，故本地留一份最小映射） */
const PRIORITY_LABEL: Record<string, string> = { low: '缓', mid: '中', high: '急' }

export const actionPlugin: TianjiPlugin = {
  id: 'action',

  tools: [
    defineTool({
      id: 'tasks.search',
      name: '查待办',
      description: '按关键词搜索未完成的待办（含固定任务），返回标题、优先级与截止日。问"我还有哪些事/有没有做某件事"时先用它。',
      inputSchema: { query: '关键词（可留空 = 列出全部未完成，最多 12 条）' },
      mode: 'read',
      riskLevel: 'search',
      execute: async (args) => {
        const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
        const open = liveFixedTasks(useTaskStore.getState().items)
          .filter((t) => !effectiveDone(t))
          .filter((t) => !q || t.title.toLowerCase().includes(q) || t.tags.some((x) => x.toLowerCase().includes(q)))
        const rows = open.slice(0, 12).map((t) => {
          const overdue = t.dueDate && diffDays(t.dueDate) < 0 ? '（逾期）' : ''
          const due = t.dueDate ? `截止 ${t.dueDate}${overdue}` : '未设截止'
          return `- ${t.title}｜${PRIORITY_LABEL[t.priority] ?? '中'}｜${due}`
        })
        return {
          count: open.length,
          text: open.length === 0 ? '没有匹配的未完成待办。' : `${open.length} 条未完成，前 ${rows.length} 条：\n${rows.join('\n')}`,
        }
      },
    }),

    defineTool({
      id: 'tasks.create',
      name: '新建待办',
      description:
        '直接建一条待办并**立即生效**（低风险，可自动执行）。用户说"帮我记一下/记一条/加个任务/提醒我"时用它，不要只是口头答应。缺截止日就不设。',
      inputSchema: { title: '待办标题（必填）', dueDate: '截止日 yyyy-mm-dd（可选）', priority: 'low | mid | high（可选，默认 mid）' },
      mode: 'safe-write',
      riskLevel: 'create',
      execute: async (args) => {
        const title = typeof args.title === 'string' ? args.title.trim() : ''
        if (!title) throw new Error('缺少 title')
        const priority = args.priority === 'low' || args.priority === 'high' ? args.priority : 'mid'
        const dueDate = typeof args.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate) ? args.dueDate : null
        const now = nowISO()
        await useTaskStore.getState().add({
          id: createId(),
          title,
          description: '',
          done: false,
          priority,
          dueDate,
          tags: [],
          repeat: 'none',
          projectId: null,
          courseId: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        })
        return { count: 1, text: `已建待办「${title}」${dueDate ? `，截止 ${dueDate}` : ''}。` }
      },
    }),

    defineTool({
      id: 'notes.create',
      name: '记一条笔记',
      description:
        '把一句话或一段内容记进「行 · 记事本」并**立即生效**（低风险，可自动执行）。用户说"记下来/存个笔记"时用它。',
      inputSchema: { title: '标题（必填）', body: '正文（可选）' },
      mode: 'safe-write',
      riskLevel: 'create',
      execute: async (args) => {
        const title = typeof args.title === 'string' ? args.title.trim() : ''
        if (!title) throw new Error('缺少 title')
        const body = typeof args.body === 'string' ? args.body.trim() : ''
        const now = nowISO()
        await useNoteStore.getState().add({
          id: createId(),
          kind: 'note',
          title,
          body,
          tags: [],
          pinned: false,
          createdAt: now,
          updatedAt: now,
        })
        return { count: 1, text: `已记下笔记「${title}」。` }
      },
    }),
  ],
}
