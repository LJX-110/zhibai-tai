/**
 * 守墨 —— 首页速记（罗盘下方、今日上方）
 *
 * ## 它是什么
 * 只服务"随手记下来"：**不转待办、没有完成态、不计入今日炁象与今日轨迹**。
 * 之所以还放在首页，是因为速记的价值就在"打开就能写、写完就看见"。
 *
 * ## 为什么不新增表
 * 复用 `notes` 表、以 `kind = 'memo'` 区分：同步 / 导出 / 备份 / 墓碑全都现成，
 * 另开一张 33 号表只会多一份要维护的同步路径。
 *
 * ## 展示口径
 * 新建的在上；首屏 5 条，展开每次 +10 条。条目只显示正文前两行与时间 ——
 * 速记不是清单，首页也不该被它撑长。
 */
import { useState } from 'react'
import { ChevronDown, PenLine } from 'lucide-react'
import { useNoteStore } from '../../stores/useNoteStore'
import { useToastStore } from '../ui/toast-store'
import { Section } from '../ui'
import { MEMO_FIRST_PAGE, MEMO_MORE_STEP, memosOf, memoTimeLabel } from './memo-list'
import { MemoEditor } from './MemoEditor'
import type { Note } from '../../types/entities'

export function MemoBlock() {
  const notes = useNoteStore((s) => s.items)
  const [limit, setLimit] = useState(MEMO_FIRST_PAGE)
  const [editing, setEditing] = useState<Note | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  // 派生在组件体内算：zustand selector 里 .filter() 会生成新引用 → 快照永变 → 无限重渲染
  const memos = memosOf(notes)
  const shown = memos.slice(0, limit)

  const openEditor = (memo: Note | null) => {
    setEditing(memo)
    setEditorOpen(true)
  }

  return (
    <div className="mt-2">
      <Section title="守墨" hint={memos.length > 0 ? `${memos.length} 条` : undefined}>
        {/* 入口固定 64px 整条：整行可点，窄屏也不会有"点不中"的边角 */}
        <button
          type="button"
          onClick={() => openEditor(null)}
          className="flex h-16 w-full items-center gap-2.5 rounded-tile border border-dashed border-line-strong px-3 text-left transition-colors hover:border-cinnabar/40 hover:bg-nested/40"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cinnabar/10 text-cinnabar">
            <PenLine size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink">记一笔</span>
            <span className="block text-xs text-ink-faint">随手记下，不转待办</span>
          </span>
        </button>

        {shown.length > 0 && (
          <div className="mt-1">
            {shown.map((memo) => (
              <button
                key={memo.id}
                type="button"
                onClick={() => openEditor(memo)}
                className="flex w-full items-start gap-2 rounded-tile px-2.5 py-2 text-left transition-colors hover:bg-nested/60"
              >
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-bronze/70" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
                    {memo.body}
                  </span>
                  <span className="tabular mt-0.5 block text-xs text-ink-faint">{memoTimeLabel(memo.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {memos.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + MEMO_MORE_STEP)}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-tile py-2 text-xs text-ink-faint transition-colors hover:text-ink"
          >
            <ChevronDown size={13} />
            展开更多（还有 {memos.length - limit} 条）
          </button>
        )}
      </Section>

      <MemoEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        memo={editing}
        onSave={(memo) => useNoteStore.getState().save(memo)}
        onDelete={async (id) => {
          const ok = await useNoteStore.getState().remove(id)
          if (ok) useToastStore.getState().push('已删除', 'info')
          return ok
        }}
      />
    </div>
  )
}
