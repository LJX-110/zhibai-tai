/**
 * Loading —— 全站**唯一**的加载语言（Step 5-3 §十五）
 *
 * ## 为什么要有它
 * 审计发现项目里其实**已经只有两种形态**（不是"每页各写一套"）：
 *   · 动作中：`RefreshCw` + `animate-spin`（旋转箭头）
 *   · 状态中：`1.5px` 圆点 + `animate-pulse`
 * 问题是这两种形态**靠"抄同一串 class"维持一致** —— 抄漏一个字符就开始漂移，
 * 而下一页的人只会再抄一次。所以这里把它固化成组件：一致性由**代码**保证，不靠自觉。
 *
 * ## 三级（§十五 的分类，不是"全部改成骨架屏"）
 * | variant | 用在哪 | 形态 |
 * | --- | --- | --- |
 * | `icon`  | **Inline**：按钮里 / 行内（"抓取中""同步中"） | 旋转箭头，跟文字同排 |
 * | `dot`   | **状态**：数据已就绪、只是"正在忙"（侧栏同步点、消息流） | 呼吸圆点 |
 * | `page`  | **Page**：懒加载页面的占位 | 圆点 + 一句短语，居中留白 |
 * | （App 级） | 启动 | **不在这里** —— 它是 `index.html` 的静态启动屏 + `app/BootScreen`（内联样式，首帧就要有） |
 *
 * ⚠️ **Skeleton 暂不提供**：本地 IndexedDB 是毫秒级返回，骨架屏的"结构预览"价值几乎为零，
 * 强行上会让每次切换都闪一下假格子。§十二 的要求是"只有适合结构预览的区域才用" —— 当前没有这种区域。
 */
import { RefreshCw } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface LoadingProps {
  variant?: 'icon' | 'dot' | 'page'
  /** `icon` 档的图标尺寸（默认 13，与行内按钮一致） */
  size?: number
  /** `page` 档的短语（保持 2–6 字，与"展开卷轴…"同一语气） */
  label?: string
  /**
   * `icon` 档专用：**是否正在转**。
   * 调用点原本普遍写成 `cn(busy && 'animate-spin')` —— 即"忙了才转、闲时是个静态箭头"。
   * 这个语义要保留（闲着还转的图标会让人以为它一直在加载），所以做成显式 prop。
   */
  spinning?: boolean
  className?: string
}

export function Loading({ variant = 'icon', size = 13, label, spinning = true, className }: LoadingProps) {
  if (variant === 'dot') {
    // 1.5px 是审计里已有的尺寸，不动它 —— 统一不是"重新发明一套尺寸"
    return (
      <span
        className={cn('inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-bronze', className)}
        aria-hidden="true"
      />
    )
  }

  if (variant === 'page') {
    return (
      <div
        className={cn('flex items-center gap-2 py-16 text-sm text-ink-faint', className)}
        role="status"
        aria-live="polite"
      >
        <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-bronze" aria-hidden="true" />
        {label ?? '展开卷轴…'}
      </div>
    )
  }

  return (
    <RefreshCw
      size={size}
      className={cn(spinning && 'animate-spin', className)}
      aria-label={spinning ? '加载中' : undefined}
      role={spinning ? 'status' : undefined}
    />
  )
}
