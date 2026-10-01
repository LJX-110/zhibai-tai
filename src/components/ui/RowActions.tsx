/**
 * RowActions —— 列表行里的操作区（**从既有成熟实现提取，不是新设计**）
 *
 * ## 它解决的是一类反复出现的问题
 * 「财 · 流水行」（`pages/finance/shared.tsx` + `LedgerTab`）与「情报源行」
 * （`components/source/SourceRow.tsx` + `SourceManager`）**早就实现了同一套规则**：
 *
 *   宽屏 → 直接显示图标按钮
 *   窄屏 → 只留一个「更多」，点开是 Dialog 里一列按钮（按钮用 `variant="danger"` 标危险操作）
 *
 * 但**两处各写各的**，连 Dialog 里的按钮列都各写一遍。于是后来新增的列表行
 * （笔记、课程计划）只有两种下场：复制第三遍，或者干脆只放一个删除按钮 ——
 * 这正是 Step 5-2B 实测出的「触控目标不足」与「编辑入口看不见」两类问题的共同根源。
 *
 * 本组件把这条规则收成**一处**，它就是产品标准 §6「操作入口规范」的可执行版本。
 *
 * ## 规则（与标准一致）
 * | 操作数 | 窄屏（默认判定 = 移动布局） | 宽屏 |
 * | --- | --- | --- |
 * | 0 | 不渲染 | 不渲染 |
 * | 1 | **直接显示**（一个图标按钮不拥挤） | 直接显示 |
 * | ≥ 2 | **收进「更多」** | 直接显示 |
 *
 * ⚠️ 窄屏不硬塞多个 44px 图标：`touch-target` 是 `min-height/min-width:44px`，
 * **会真实改变布局**，一排三个会把正文挤没（`index.css:280`）。收进「更多」才是正解。
 */
import { useState, type ReactNode } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Dialog } from './Dialog'
// 布局判定收口在 layouts/useResolvedLayout（`components/source/SourceManager` 也是这么引的，非新依赖方向）
import { useResolvedLayout } from '../../layouts/useResolvedLayout'

export interface RowAction {
  /** 稳定标识（React key / 测试用） */
  key: string
  label: string
  icon: LucideIcon
  onClick: () => void
  /** 危险操作（删除）→ Dialog 里用 `danger` 型按钮、行内用朱红 */
  danger?: boolean
}

export interface RowActionsProps {
  actions: RowAction[]
  /**
   * 是否走紧凑形态。**通常不用传** —— 不传时按当前布局自动判定（移动 → 紧凑）。
   * 显式传入只在"行处在非响应式容器里"时需要（如桌面侧栏内的列表）。
   */
  compact?: boolean
  /**
   * **窄屏也直显全部图标**（Step 5-3E）：默认规则（≥2 个收进「更多」）是给
   * 正文较长的行用的（一排图标会把正文挤没）；但课程计划这类行正文短，
   * 用户明确要求"像待办一样" —— 待办行（`components/task/TaskItem.tsx`）的三件套就是直显的。
   * 传 true 即与待办行同形制：详情 / 编辑 / 删除 三个图标直接可见。
   */
  alwaysInline?: boolean
  /** 「更多」面板的标题；不传则用「操作」 */
  moreTitle?: ReactNode
  className?: string
}

export function RowActions({ actions, compact, alwaysInline, moreTitle, className }: RowActionsProps) {
  const resolved = useResolvedLayout()
  const [open, setOpen] = useState(false)
  // 无条件调用 hook（上面），这里才决定用哪个值 —— 不能把 hook 写进条件里
  const isCompact = compact ?? resolved === 'mobile'

  if (actions.length === 0) return null

  /** 一个操作不拥挤：窄屏也直接给，省一次点击；`alwaysInline` 时全部直显 */
  if (alwaysInline || !isCompact || actions.length === 1) {
    return (
      <>
        {actions.map((a) => (
          <button
            key={a.key}
            className={cn(
              // 与财的行内按钮同形制（复用既有事实，不另立一套）
              'touch-target inline-flex items-center justify-center rounded-control p-1.5 text-ink-muted hover:bg-raised',
              a.danger && 'hover:text-cinnabar',
              className,
            )}
            onClick={a.onClick}
            aria-label={a.label}
            title={a.label}
          >
            <a.icon size={13} />
          </button>
        ))}
      </>
    )
  }

  return (
    <>
      <button
        className={cn(
          'touch-target flex items-center justify-center rounded-control text-ink-muted hover:bg-raised',
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label="更多操作"
        title="更多操作"
      >
        <MoreHorizontal size={16} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={moreTitle ?? '操作'}>
        <div className="space-y-2">
          {actions.map((a) => (
            <button
              key={a.key}
              className={cn(
                'flex w-full items-center gap-2 rounded-control border border-line px-3 py-2.5 text-left text-sm transition-colors',
                a.danger
                  ? 'text-cinnabar hover:bg-cinnabar/10'
                  : 'text-ink hover:bg-raised',
              )}
              onClick={() => {
                // 先关面板再执行：动作若自己会开新弹层（编辑/详情），
                // 不先关就会出现"两层叠在一起、关掉上层露出下层"的观感
                setOpen(false)
                a.onClick()
              }}
            >
              <a.icon size={15} />
              {a.label}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  )
}
