/**
 * 奇 · 历史页签（占卜存档 + 计数 + 逐条删除 + 清空）
 * 状态自持；清空必须走 store.clear()（同一事务清表 + 逐行写墓碑）。
 */
import { useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import { useDivinationStore } from '../../stores/useDivinationStore'
import { useInspectorStore } from '../../components/inspector/Inspector'
import { Badge, Button, Dialog, EmptyState, Section, useToast } from '../../components/ui'

export function HistoryTab() {
  const toast = useToast().toast
  const records = useDivinationStore((s) => s.items)
  const [clearOpen, setClearOpen] = useState(false)

  const meihuaCount = records.filter((r) => r.type === 'bagua').length
  const dayanCount = records.filter((r) => r.type === 'dayan').length
  const signCount = records.filter((r) => r.type === 'daily_sign').length

  /**
   * 清空存档：必须走 store.clear() —— 它内部走 repo 工厂，
   * 在同一个事务里清表并逐行写墓碑，删除才会随同步传播到其他设备。
   * 逐条 remove 拼出来的「批量」会拆成 N 个事务与 N 次同步触发。
   */
  const clearArchive = async () => {
    setClearOpen(false)
    const ok = await useDivinationStore.getState().clear()
    // 失败时 store 层已经给出原因提示，这里不重复播报
    if (ok) toast('已清空全部占卜存档', 'success')
  }

  return (
    <div className="mt-2">
      <Section
        title="历史"
        hint={`${records.length} 次 · 占卜存档`}
        action={
          <div className="flex items-center gap-2">
            <History size={14} className="text-ink-faint" />
            <Button
              size="sm"
              variant="danger"
              onClick={() => setClearOpen(true)}
              disabled={records.length === 0}
            >
              <Trash2 size={13} /> 清空存档
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge tone="teal">梅花 {meihuaCount}</Badge>
          <Badge tone="cinnabar">大衍 {dayanCount}</Badge>
          <Badge tone="plain">签 {signCount}</Badge>
        </div>
        {records.length > 0 ? (
          <div>
            {records
              .slice()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 12)
              .map((r) => (
                /* 外层不再用 button 包整行：删除按钮无法嵌在 button 里（HTML 非法且点击冲突） */
                <div key={r.id} className="row group">
                  <button
                    onClick={() => useInspectorStore.getState().open('divination', r.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="tabular shrink-0 text-xs text-ink-faint">{r.date}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.title}</span>
                    <Badge tone={r.type === 'bagua' || r.type === 'dayan' ? 'teal' : r.type === 'daily_sign' ? 'cinnabar' : 'plain'}>
                      {r.type === 'daily_sign' ? '每日签' : r.type === 'bagua' ? '梅花' : r.type === 'dayan' ? '大衍' : r.type}
                    </Badge>
                  </button>
                  <button
                    onClick={async () => {
                      await useDivinationStore.getState().remove(r.id)
                      toast('已删除该条存档')
                    }}
                    className="hover-reveal rounded-control p-1.5 text-ink-faint transition-colors hover:bg-raised hover:text-cinnabar"
                    aria-label="删除该条存档"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState
            icon={History}
            title="暂无占卜记录"
            desc="起卦、记签后会自动留档"
            step="先起一卦或记一签"
          />
        )}
      </Section>

      {/* 清空是不可逆的成批删除，必须先说清范围与后果再落刀 */}
      <Dialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="清空全部存档？"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setClearOpen(false)}>取消</Button>
            <Button variant="danger" onClick={clearArchive}>删除全部</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          将删除本机全部 <span className="tabular font-medium text-ink">{records.length}</span> 条占卜存档，不可恢复。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          删除会随同步传播到其他设备。
        </p>
      </Dialog>
    </div>
  )
}
