/**
 * 情报源 · 测试预览弹窗（连接 → 预览 → 字段映射确认 → 保存）
 */
import { Zap } from 'lucide-react'
import type { IntelligenceItem, IntelligenceSource } from '../../types/entities'
import type { SourceFetchFailure } from '../../services/intelligence/run'
import { KIND_LABEL } from '../../services/intelligence/errors'
import { Button, Dialog } from '../ui'

export interface PreviewState {
  source: IntelligenceSource
  items: IntelligenceItem[]
  error?: SourceFetchFailure
  loading: boolean
}

export function TestPreviewDialog({
  preview,
  onClose,
  onRetest,
  onConfirm,
}: {
  preview: PreviewState | null
  onClose: () => void
  onRetest: (s: IntelligenceSource) => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={preview != null}
      onClose={onClose}
      title={`测试 · ${preview?.source.name ?? ''}`}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>关闭</Button>
          <Button variant="primary" onClick={onConfirm} disabled={!preview || preview.loading}>
            确认保存
          </Button>
        </>
      }
    >
      {preview?.loading ? (
        <p className="py-8 text-center text-sm text-ink-faint">连接与解析中…</p>
      ) : preview?.error ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-tile border border-cinnabar/40 bg-cinnabar/5 px-4 py-3">
            <span className="seal seal--done">{KIND_LABEL[preview.error.kind]}</span>
            <span className="text-sm text-ink">{preview.error.message}</span>
          </div>
          <p className="hidden text-xs leading-relaxed text-ink-faint md:block">
            失败分类：待配置（没配代理/缺 key）/ 跨域被拦 / 被反爬拦截 / 需认证 / 被限流 /
            超时 / 解析失败 / 无数据 / HTTP 错误 / 网络不可达。
            {preview.error.retryable ? '此类失败通常重试或换通道后可以恢复。' : '此类失败重试无用，需要先改配置。'}
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              const src = preview.source
              onClose()
              onRetest(src)
            }}
          >
            <Zap size={14} /> 重新测试
          </Button>
        </div>
      ) : preview ? (
        preview.items.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-ink-faint">
              共拉取 <span className="text-ink">{preview.items.length}</span> 条 · 已按统一模型映射：
            </p>
            {preview.items.slice(0, 5).map((it) => (
              <div key={it.id} className="rounded-tile border border-line px-3 py-2">
                <div className="text-sm font-medium text-ink">{it.title}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                  {it.url && <span className="truncate">链接 {it.url}</span>}
                  {it.publishedAt && <span className="tabular">{it.publishedAt.slice(0, 10)}</span>}
                  {it.category && <span>{it.category}</span>}
                </div>
              </div>
            ))}
            {preview.items.length > 5 && (
              <p className="text-xs text-ink-faint">… 其余 {preview.items.length - 5} 条略</p>
            )}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-ink-faint">连接成功，但没有解析到条目（empty）</p>
        )
      ) : null}
    </Dialog>
  )
}
