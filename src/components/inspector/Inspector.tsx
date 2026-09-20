/**
 * Inspector —— 右侧详情面板（桌面）/ 底部 Sheet（移动）
 * 支持：任务 / 收藏 / 项目 / 情报 / 课程 / 消费 / AI 资产 / 奇门记录
 * 结构：标题 → 状态 → 核心信息 → 关联 → 操作（不重复整个页面）
 *
 * 拆分说明（2026-09-20 路线图第 4 步）：八种实体的详情各自成文件放在本目录下，
 * 由 `InspectorBody` 按 type 分发；每个详情**自己按 id 取实体**，取不到就显示空态
 * （与原实现的分支判断等价，且省掉了每次渲染都算的 8 次无用查找）。
 *
 * `useInspectorStore` 仍从本文件导出 —— 多处页面按这个路径引用，避免本轮扩大改动面。
 */
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import { OverlayScrim } from '../ui/OverlayScrim'
import { useModalLayer } from '../ui/overlay'
import { useInspectorStore } from './inspector-store'
import { TaskDetail } from './TaskDetail'
import { CollectionDetail } from './CollectionDetail'
import { ProjectDetail } from './ProjectDetail'
import { IntelligenceDetail } from './IntelligenceDetail'
import { CourseDetail } from './CourseDetail'
import { FinanceDetail } from './FinanceDetail'
import { AiDetail } from './AiDetail'
import { DivinationDetail } from './DivinationDetail'
import { EmptyInspector } from './shared'

export { useInspectorStore }
export type { InspectorType } from './inspector-store'

export function Inspector() {
  const { type, id, close } = useInspectorStore()
  const layout = useResolvedLayout()
  const isMobile = layout === 'mobile'
  // 浮层行为与 Dialog / Sheet 共用一份实现：
  // 移动端是模态底部弹层（登记层级栈、接管焦点、开合伴音）；
  // 桌面端是常驻侧栏，不是模态层 —— 不夺焦点也不登记，只在没有模态层压住时响应 Esc。
  const panelRef = useModalLayer({ open: Boolean(type && id), onClose: close, modal: isMobile })

  if (!type || !id) return null

  const content = <InspectorBody type={type} id={id} onClose={close} />

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[var(--z-overlay)]">
        <OverlayScrim onClose={close} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="详情"
          tabIndex={-1}
          className="talisman overlay-panel overlay-panel--edge absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-overlay anim-sheet focus:outline-none"
        >
          {content}
        </div>
      </div>
    )
  }

  return (
    <aside className="fixed right-0 top-[var(--header-h)] bottom-0 z-[var(--z-header)] w-[360px] overflow-y-auto border-l border-line bg-panel p-6 anim-enter-fast">
      {content}
    </aside>
  )
}

/** 按实体类型分发到各自的详情视图 */
function InspectorBody({ type, id, onClose }: { type: string; id: string; onClose: () => void }) {
  switch (type) {
    case 'task':
      return <TaskDetail id={id} onClose={onClose} />
    case 'collection':
      return <CollectionDetail id={id} onClose={onClose} />
    case 'project':
      return <ProjectDetail id={id} onClose={onClose} />
    case 'intelligence':
      return <IntelligenceDetail id={id} onClose={onClose} />
    case 'course':
      return <CourseDetail id={id} onClose={onClose} />
    case 'finance':
      return <FinanceDetail id={id} onClose={onClose} />
    case 'ai':
      return <AiDetail id={id} onClose={onClose} />
    case 'divination':
      return <DivinationDetail id={id} onClose={onClose} />
    default:
      return <EmptyInspector onClose={onClose} />
  }
}
