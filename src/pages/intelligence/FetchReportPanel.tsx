/**
 * 情 · 抓取失败报告
 * 每个源分别给出「坏在哪一步」+ 单源重试入口。
 * 只报「N 个源失败」等于把用户留在原地 —— 他能做的判断只有「再点一次」。
 */
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { KIND_LABEL } from '../../services/intelligence/errors'
import { cn } from '../../utils/cn'
import type { FetchReport } from './shared'

export function FetchReportPanel({
  report,
  retryingId,
  onRetry,
  onDismiss,
}: {
  report: FetchReport
  /** 正在单独重试的源 id：让用户看清「在重试哪一个」 */
  retryingId: string | null
  onRetry: (sourceId: string) => void
  onDismiss: () => void
}) {
  if (report.failures.length === 0 && report.skipped.length === 0) return null
  return (
    <div className="mb-3 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm text-ink">
        <AlertTriangle size={13} className="shrink-0 text-cinnabar" />
        <span>
          {report.failures.length} 个源抓取失败
          {report.added > 0 && (
            <span className="ml-1.5 text-ink-muted">· 另新增 {report.added} 条</span>
          )}
        </span>
        <button
          onClick={onDismiss}
          className="ml-auto shrink-0 text-xs text-ink-faint transition-colors hover:text-ink"
        >
          收起
        </button>
      </div>
      <div className="mt-1.5 space-y-1.5">
        {report.failures.map((f) => (
          <div key={f.sourceId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs text-ink-soft">{f.sourceName}</span>
            <span className="rounded-control bg-cinnabar/10 px-1.5 text-xs text-cinnabar">
              {KIND_LABEL[f.kind]}
            </span>
            {/* 单源重试只重打这一个源：整轮重试会让已经正常的源再被打一遍，
                那正是把源推向限流的做法 */}
            {f.retryable && (
              <button
                onClick={() => onRetry(f.sourceId)}
                disabled={retryingId === f.sourceId}
                className="ml-auto shrink-0 rounded-control px-1.5 py-0.5 text-xs text-teal transition-colors hover:bg-teal/10 disabled:text-ink-faint"
              >
                <RefreshCw size={11} className={cn('mr-0.5 inline', retryingId === f.sourceId && 'animate-spin')} />
                {retryingId === f.sourceId ? '重试中' : '重试'}
              </button>
            )}
            <span className="w-full text-xs leading-relaxed text-ink-muted">{f.message}</span>
          </div>
        ))}
      </div>
      {report.skipped.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          {report.skipped.length} 个源已连续失败，本次跳过未请求：
          {report.skipped
            .map((s) => `${s.sourceName}（${Math.ceil(s.retryAfterMs / 60_000)} 分钟后）`)
            .join('、')}
        </p>
      )}
      {report.failures.some((f) => f.kind === 'config' || f.kind === 'cors') && (
        <p className="mt-2 border-t border-cinnabar/20 pt-1.5 text-xs leading-relaxed text-bronze">
          其中的中文源不放 CORS 头，浏览器无法直连：在「系统 · 情报源 · 自建代理」填入转发地址即可
          （部署说明见仓库 proxy/）
        </p>
      )}
    </div>
  )
}
