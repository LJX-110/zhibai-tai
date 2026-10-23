/**
 * 情 · 抓取失败报告
 * 每个源分别给出「坏在哪一步」+ 单源重试入口。
 * 只报「N 个源失败」等于把用户留在原地 —— 他能做的判断只有「再点一次」。
 *
 * 默认只占一行：抓取成功时不打扰，失败时也知道数量；要看哪个源坏了再展开。
 */
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { KIND_LABEL } from '../../services/intelligence/errors'
import { Loading } from '../../components/ui/Loading'
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
  const [open, setOpen] = useState(false)
  if (report.failures.length === 0 && report.skipped.length === 0) return null

  const summary =
    report.failures.length > 0
      ? `${report.failures.length} 个源抓取失败`
      : `${report.skipped.length} 个源本次跳过`

  return (
    <div className="mb-3 rounded-tile border border-cinnabar/30 bg-cinnabar/5 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm text-ink">
        <AlertTriangle size={13} className="shrink-0 text-cinnabar" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          {summary}
          {report.added > 0 && (
            <span className="ml-1.5 text-ink-muted">· 另新增 {report.added} 条</span>
          )}
          <span className="ml-2 text-xs text-ink-faint">{open ? '收起' : '详情'}</span>
        </button>
        <button
          onClick={onDismiss}
          className="shrink-0 text-xs text-ink-faint transition-colors hover:text-ink"
        >
          忽略
        </button>
      </div>

      {open && (
        <>
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
                    <Loading size={11} spinning={retryingId === f.sourceId} className="mr-0.5 inline" />
                    {retryingId === f.sourceId ? '重试中' : '重试'}
                  </button>
                )}
                <span className="w-full text-xs leading-relaxed text-ink-muted">{f.message}</span>
              </div>
            ))}
          </div>
          {report.skipped.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              {report.skipped.length} 个源连续失败，本次未请求：
              {report.skipped
                .map((s) => `${s.sourceName}（${Math.ceil(s.retryAfterMs / 60_000)} 分钟后）`)
                .join('、')}
            </p>
          )}
          {/* 只有「缺代理」才推行自建代理；来源自己缺地址/已下线属于另一种配置问题，
              在这里劝用户去配代理只会把人带错方向 */}
          {report.failures.some((f) => f.kind === 'cors' || (f.kind === 'config' && f.message.includes('代理'))) && (
            <p className="mt-2 border-t border-cinnabar/20 pt-1.5 text-xs leading-relaxed text-bronze">
              中文源大多不返回跨域头，浏览器无法直连 → 在「系统 · 数据 · 抓取与代理」填入转发地址
            </p>
          )}
        </>
      )}
    </div>
  )
}
