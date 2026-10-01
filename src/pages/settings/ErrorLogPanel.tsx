/**
 * 设置 · 故障记录（**纯内容**，Step 5-3E 起不再自带折叠）
 *
 * 记录来源三类：渲染异常（ErrorBoundary）、脚本错误（window error）、
 * 未处理的异步错误（unhandledrejection）。后两类是 React 错误边界管不到的盲区，
 * 也是用户口中「点了按钮没反应」最常见的真实成因。
 *
 * ⚠️ **为什么去掉自己的 Collapse**：它现在被并进「危险操作 · 故障记录」那一个折叠里，
 * 两层折叠就是用户明确反对的"一环套一环"。可见性交给外层，本组件只管内容。
 */
import { useState } from 'react'
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
  // 外层折叠只在展开时挂载本组件 → 每次展开都是现读，"上次打开时的旧列表"问题不存在
  const [records, setRecords] = useState(listErrors)

  return (
    <>
      <div className="row flex-wrap">
        <span className="w-20 shrink-0 text-sm text-ink-muted">故障</span>
        <span className="flex-1 text-xs text-ink-faint">
          {records.length > 0
            ? `${records.length} 条 · 渲染异常 / 事件回调 / 未处理的异步错误`
            : '无记录'}
        </span>
        {records.length > 0 && (
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
        )}
      </div>

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
    </>
  )
}
