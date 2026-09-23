/**
 * 天机 · 动作块的**呈现**（通用外壳，只导出组件）
 *
 * 模型提议的「创建类」动作在这里渲染成预览卡片；
 * **必须由用户点「确认」才落库**，点「忽略」则丢弃（绝不静默写数据）。
 *
 * ## P2 开放化（2026-09-22）
 * 本文件**不再认识任何具体动作**：卡片主体（含眉标）由**归属插件**的
 * `preview(fields)` 给出，中文名由 `label` 给出，落库走 `run(fields)`。
 * 所以加一种动作**不必再改本文件** —— 之前的版本里硬编码了三种动作的
 * 布局与"待办/笔记/收支"字样，加动作得回来改这里。
 *
 * ## 2026-09-23 拆出文本层
 * `stripActionFences` / `actionTitle` 已迁到 `./action-text` ——
 * 组件与非组件同文件会让 Fast Refresh 失去完整性（改卡片布局会重置对话面板状态）。
 */
import { CheckCircle2 } from 'lucide-react'
import type { TianjiActionPayload } from './action-protocol'
import { actionTitle } from './action-text'
import { actionDefFor } from './plugins'

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
  const def = actionDefFor(a.action)
  // 未申报的动作不会被协议解析出来；这里兜一层是为了"配置改动后回放旧回答"也能安全跳过
  if (!def) return null

  if (done) {
    return (
      <div className="rounded-tile border border-line bg-raised px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm text-teal">
          <CheckCircle2 size={14} />
          已加入{def.label}：{actionTitle(a)}
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-tile border border-line bg-raised px-3 py-2.5">
      <div className="mb-1.5 eyebrow text-ink-faint">天机提议 · 点确认才写入</div>
      {def.preview(a.fields)}
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
