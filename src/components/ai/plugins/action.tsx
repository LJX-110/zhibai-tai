/**
 * 行 · 插件 —— 待办与笔记：**规格 + 落库 + 预览三件一体**
 *
 * 明细区没有"待办明细"块（基础概览已经给了今日/逾期/已完成三条），
 * 所以这个插件只贡献动作。
 *
 * P2 开放化后，加一种动作（比如"记一条体重"）**只改本文件**：
 * 在 `actions` 里多一个条目，写明字段规格、怎么落库、卡片长什么样即可 ——
 * 协议（`action-protocol.ts`）与卡片（`action-cards.tsx`）都不必动。
 */
import { createId, nowISO } from '../../../utils/id'
import { useTaskStore } from '../../../stores/useTaskStore'
import { useNoteStore } from '../../../stores/useNoteStore'
import { listOf, textOf } from '../action-protocol'
import type { TianjiPlugin } from './index'

/** 优先级的显示名（与 `components/task/shared.ts` 同义；插件不跨域 import，故本地留一份最小映射） */
const PRIORITY_LABEL: Record<string, string> = { low: '缓', mid: '中', high: '急' }

export const actionPlugin: TianjiPlugin = {
  id: 'action',
  actions: {
    create_task: {
      label: '新建待办',
      fields: {
        title: { kind: 'text', required: true }, // 缺标题落不了库
        priority: { kind: 'choice', values: ['low', 'mid', 'high'], fallback: 'mid' },
        dueDate: { kind: 'date' }, // 可选；写了非法值就退回"未设"
      },
      summary: (f) => textOf(f, 'title'),
      run: async (f) => {
        const now = nowISO()
        return useTaskStore.getState().add({
          id: createId(),
          title: textOf(f, 'title'),
          description: '',
          done: false,
          priority: textOf(f, 'priority') as 'low' | 'mid' | 'high',
          dueDate: textOf(f, 'dueDate') || null,
          tags: [],
          repeat: 'none',
          projectId: null,
          courseId: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        })
      },
      preview: (f) => (
        <>
          <div className="eyebrow text-ink-faint">待办</div>
          <div className="font-medium">{textOf(f, 'title')}</div>
          <div className="text-xs text-ink-muted">
            优先级 {PRIORITY_LABEL[textOf(f, 'priority')] ?? '中'} · 截止{' '}
            {textOf(f, 'dueDate') || '未设'}
          </div>
        </>
      ),
    },

    create_note: {
      label: '新建笔记',
      fields: {
        title: { kind: 'text', required: true },
        body: { kind: 'text' },
        tags: { kind: 'textList' },
      },
      summary: (f) => textOf(f, 'title'),
      run: async (f) => {
        const now = nowISO()
        return useNoteStore.getState().add({
          id: createId(),
          kind: 'note',
          title: textOf(f, 'title'),
          body: textOf(f, 'body'),
          tags: listOf(f, 'tags'),
          pinned: false,
          createdAt: now,
          updatedAt: now,
        })
      },
      preview: (f) => (
        <>
          <div className="eyebrow text-ink-faint">笔记</div>
          <div className="font-medium">{textOf(f, 'title')}</div>
          {textOf(f, 'body') ? (
            <div className="line-clamp-2 text-xs text-ink-muted">{textOf(f, 'body')}</div>
          ) : null}
        </>
      ),
    },
  },
}
