/**
 * IntelTidy —— 情报 AI 整理
 * 对未读情报批量：去重提示 / 分类 / 标签 / 重要度
 * 原则：先生成预览 → 用户确认 → 才写入
 */
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useIntelligenceStore } from '../../stores/useIntelligenceStore'
import { aiService } from '../../services/ai/ai-service'
import { dedupeKey } from '../source/SourceManager'
import { playSound } from '../../services/sound'
import { Button, Dialog, useToast } from '../ui'

interface TidyRow {
  id: string
  title: string
  category?: string
  tags: string[]
  importance: number
  dedupe: boolean
  changed: boolean
}

export function IntelTidy() {
  const toast = useToast().toast
  const items = useIntelligenceStore((s) => s.items)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<TidyRow[]>([])

  const run = async () => {
    setOpen(true)
    setBusy(true)
    setRows([])
    playSound('ui-open')
    try {
      const unread = items.filter((it) => !it.read).slice(0, 8)
      const known = new Set<string>()
      const results: TidyRow[] = []
      for (const it of unread) {
        const k = dedupeKey(it)
        const dedupe = known.has(k)
        known.add(k)
        const [tags, importance, category] = await Promise.all([
          aiService.tag(it),
          aiService.rank(it),
          aiService.classify(it),
        ])
        const newTags = tags.filter((t) => !it.tags.includes(t))
        results.push({
          id: it.id,
          title: it.title,
          category,
          tags: newTags,
          importance,
          dedupe,
          changed: newTags.length > 0 || category !== (it.category ?? '自定义'),
        })
      }
      setRows(results)
      playSound('success')
    } catch {
      toast('AI 整理失败', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    let applied = 0
    for (const r of rows) {
      if (!r.changed) continue
      const it = useIntelligenceStore.getState().items.find((x) => x.id === r.id)
      if (!it) continue
      const patch: { category?: string; tags?: string[]; aiSummary?: string } = {}
      if (r.category && r.category !== (it.category ?? '自定义')) patch.category = r.category
      if (r.tags.length > 0) patch.tags = [...new Set([...it.tags, ...r.tags])]
      if (Object.keys(patch).length > 0) {
        await useIntelligenceStore.getState().update(r.id, patch)
        applied++
      }
    }
    playSound('seal')
    toast(`已整理 ${applied} 条情报`, applied > 0 ? 'success' : 'info')
    setOpen(false)
  }

  const changed = rows.filter((r) => r.changed).length

  return (
    <>
      <Button size="sm" variant="secondary" onClick={run} disabled={busy || items.length === 0} className="!px-2.5">
        <Sparkles size={13} /> AI 整理
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="AI 整理 · 预览"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={apply} disabled={busy || changed === 0}>
              确认应用（{changed} 条）
            </Button>
          </>
        }
      >
        {busy ? (
          <p className="py-8 text-center text-sm text-ink-faint">正在分析未读情报…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">暂无未读情报可整理</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-faint">
              建议：分类 / 新增标签 / 重要度（本地规则为轻量建议，配置远程模型后可更智能）
            </p>
            {rows.map((r) => (
              <div key={r.id} className="rounded-tile border border-line px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.title}</span>
                  {r.dedupe && <span className="seal seal--done">疑似重复</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                  <span>分类：{r.category}</span>
                  <span>标签：{r.tags.length > 0 ? r.tags.join('、') : '无新增'}</span>
                  <span>重要度：{r.importance}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </>
  )
}
