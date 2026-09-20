/**
 * 天机 · 动作块的处理与呈现
 * 模型提议的「创建类」动作在这里解析掉围栏、渲染成预览确认卡片；
 * **必须由用户点「确认」才落库**，点「忽略」则丢弃（绝不静默写数据）。
 */
import { CheckCircle2 } from 'lucide-react'
import type { Priority } from '../../types/entities'
import type { TianjiActionPayload } from './action-protocol'

/** 把气泡里「动作块」剥掉：动作已由下方预览卡片呈现，气泡里不该再露原始 JSON。 */
export function stripActionFences(text: string): string {
  return text
    .replace(/```(?:[a-zA-Z0-9_-]*)?\s*\n?([\s\S]*?)```/gi, (whole, body: string) => {
      const t = body.trim()
      try {
        const v = JSON.parse(t)
        const arr = Array.isArray(v) ? v : [v]
        if (arr.some((x) => x && typeof x === 'object' && typeof (x as Record<string, unknown>).action === 'string')) {
          return '' // 是动作块 → 交给预览卡片，气泡里不显示
        }
      } catch {
        /* 非动作块（如代码样例）原样保留 */
      }
      return whole
    })
    .trim()
}

const PRIORITY_LABEL: Record<Priority, string> = { low: '低', mid: '中', high: '高' }

/** 一条动作的简短摘要（待办/笔记用标题，收支用「收支 ¥金额 · 分类」） */
export function actionTitle(a: TianjiActionPayload): string {
  if (a.action === 'create_finance') return `${a.kind === 'income' ? '收入' : '支出'} ¥${a.amount} · ${a.category}`
  return a.title
}

/** 动作预览（卡片里展示模型打算写什么，让用户确认前看清） */
function ActionPreview({ a }: { a: TianjiActionPayload }) {
  if (a.action === 'create_task') {
    return (
      <>
        <div className="text-xs tracking-[0.18em] text-ink-faint">待办</div>
        <div className="font-medium">{a.title}</div>
        <div className="text-xs text-ink-muted">
          优先级 {PRIORITY_LABEL[a.priority]} · 截止 {a.dueDate ?? '未设'}
        </div>
      </>
    )
  }
  if (a.action === 'create_note') {
    return (
      <>
        <div className="text-xs tracking-[0.18em] text-ink-faint">笔记</div>
        <div className="font-medium">{a.title}</div>
        {a.body ? <div className="line-clamp-2 text-xs text-ink-muted">{a.body}</div> : null}
      </>
    )
  }
  return (
    <>
      <div className="text-xs tracking-[0.18em] text-ink-faint">{a.kind === 'income' ? '收入' : '支出'}</div>
      <div className="font-medium">¥{a.amount} · {a.category}</div>
      {a.note ? <div className="text-xs text-ink-muted">{a.note}</div> : null}
      {a.date ? <div className="text-xs text-ink-faint">{a.date}</div> : null}
    </>
  )
}

/** 预览确认卡片：必须由用户点「确认」才落库，点「忽略」则丢弃（绝不静默写数据）。 */
export function ActionConfirmCard({
  a,
  done,
  onConfirm,
  onSkip,
}: {
  a: TianjiActionPayload
  done: boolean
  onConfirm: () => void
  onSkip: () => void
}) {
  if (done) {
    const label = a.action === 'create_task' ? '待办' : a.action === 'create_note' ? '笔记' : '收支'
    return (
      <div className="rounded-tile border border-line bg-raised px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm text-teal">
          <CheckCircle2 size={14} />
          已加入{label}：{actionTitle(a)}
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-tile border border-line bg-raised px-3 py-2.5">
      <div className="mb-1.5 text-xs tracking-[0.18em] text-ink-faint">天机提议 · 点确认才写入</div>
      <ActionPreview a={a} />
      <div className="mt-2 flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 rounded-control bg-teal py-1.5 text-sm font-medium text-on-sidebar transition-opacity active:opacity-80"
        >
          确认添加
        </button>
        <button
          onClick={onSkip}
          className="rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          忽略
        </button>
      </div>
    </div>
  )
}
