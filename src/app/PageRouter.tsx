/**
 * 页面路由 —— 按一级导航渲染页面
 * 使用 React.lazy 按页分割，减小首屏体积
 */
import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import type { SectionId } from './navigation'

const OverviewPage = lazy(() =>
  import('../pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
)
const ActionPage = lazy(() =>
  import('../pages/ActionPage').then((m) => ({ default: m.ActionPage })),
)
const CultivatePage = lazy(() =>
  import('../pages/CultivatePage').then((m) => ({ default: m.CultivatePage })),
)
const StudyPage = lazy(() =>
  import('../pages/StudyPage').then((m) => ({ default: m.StudyPage })),
)
const FinancePage = lazy(() =>
  import('../pages/FinancePage').then((m) => ({ default: m.FinancePage })),
)
const CollectionPage = lazy(() =>
  import('../pages/CollectionPage').then((m) => ({ default: m.CollectionPage })),
)
const IntelligencePage = lazy(() =>
  import('../pages/IntelligencePage').then((m) => ({ default: m.IntelligencePage })),
)
const OccultPage = lazy(() =>
  import('../pages/OccultPage').then((m) => ({ default: m.OccultPage })),
)
const AIPage = lazy(() =>
  import('../pages/AIPage').then((m) => ({ default: m.AIPage })),
)
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

const PAGE_MAP: Record<SectionId, React.LazyExoticComponent<() => React.ReactNode>> = {
  overview: OverviewPage,
  action: ActionPage,
  cultivate: CultivatePage,
  study: StudyPage,
  finance: FinancePage,
  collection: CollectionPage,
  intelligence: IntelligencePage,
  occult: OccultPage,
  ai: AIPage,
  system: SettingsPage,
}

/** 页面加载占位 */
function PageFallback() {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-ink-faint">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bronze" />
      展开卷轴…
    </div>
  )
}

export function PageRouter({ section }: { section: SectionId }) {
  const Page = PAGE_MAP[section]
  return (
    // 按页隔离：单页崩溃不拖垮整个应用，切换导航自动恢复
    <ErrorBoundary key={section} resetKey={section} title="此页未能展开">
      <Suspense fallback={<PageFallback />}>
        <div className="page-enter">
          <Page />
        </div>
      </Suspense>
    </ErrorBoundary>
  )
}
