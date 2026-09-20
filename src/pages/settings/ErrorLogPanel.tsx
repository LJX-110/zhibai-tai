/**
 * 设置 · 故障记录 —— 把「点了没反应」变成可查
 *
 * 记录来源三类：渲染异常（ErrorBoundary）、脚本错误（window error）、
 * 未处理的异步错误（unhandledrejection）。后两类是 React 错误边界管不到的盲区，
 * 也是用户口中「点了按钮没反应」最常见的真实成因。
 *
 * 放在设置页而不是弹窗自动跳出：故障多数时候不影响继续使用，不该打断手上的事；
 * 但一旦真出了问题，用户需要一个「我自己就能翻到」的地方，而不是等开发者开控制台。
 */
import { useState } from 'react'
import { Collapse } from '../../components/ui/Collapse'
import { Button } from '../../components/ui/Button'
import { clearErrors, KIND_LABEL, listErrors } from '../../services/error-log'
import { formatHM, friendlyDate, toISODate } from '../../utils/id'

/**
 * 记录时刻 → 「今天 21:04」/「9月18日 周x 21:04」
 *
 * 注意别直接 `at.slice(0, 10)` 当天数：`at` 是 UTC 的 ISO 串，而 friendlyDate 比的是
 * **本地**今天 —— 凌晨 0-8 点（东八区）那一段会整体差一天。统一先转成 Date 再取本地日期。
 */
function stamp(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return `${friendlyDate(toISODate(d))} ${formatHM(at)}`
}

export function ErrorLogPanel() {
  const [records, setRecords] = useState(listErrors)
  const [open, setOpen] = useState(false)

  const toggle = (next: boolean) => {
    // 展开时现读：期间可能又出错，显示上次打开时的旧列表会误导
    if (next) setRecords(listErrors())
    setOpen(next)
  }

  return (
    <Collapse
      title="故障记录"
      hint={records.length > 0 ? `${records.length} 条` : '无记录'}
      open={open}
      onOpenChange={toggle}
    >
      <p className="mb-2 text-xs leading-relaxed text-ink-muted">
        渲染异常、事件回调与未处理的异步错误都会记在这里。遇到「点了没反应」时先看这里，
        比在浏览器控制台里翻要快。
      </p>

      {records.length === 0 ? (
        <p className="py-1 text-xs text-ink-faint">还没有记录，说明一切正常。</p>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="rounded-tile border border-line p-2.5">
              <div className="flex items-baseline gap-2 text-xs text-ink-faint">
                <span className="shrink-0">{stamp(r.at)}</span>
                <span className="shrink-0 text-cinnabar/80">{KIND_LABEL[r.kind]}</span>
                {r.where && (
                  <span className="truncate" title={r.where}>
                    {r.where}
                  </span>
                )}
              </div>
              <p className="mt-1 break-all text-xs leading-relaxed text-ink-muted">{r.message}</p>
              {r.detail && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-ink-faint">调用栈</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-control bg-nested p-2 text-xs leading-relaxed text-ink-faint">
                    {r.detail}
                  </pre>
                </details>
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => {
              clearErrors()
              setRecords([])
            }}
          >
            清空记录
          </Button>
        </div>
      )}
    </Collapse>
  )
}
