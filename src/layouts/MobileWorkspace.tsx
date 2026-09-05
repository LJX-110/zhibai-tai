/**
 * MobileWorkspace —— 移动终端
 * 顶部状态 + 单列内容 + 底部导航
 */
import { useAppStore } from '../stores/useAppStore'
import { PageRouter } from '../app/PageRouter'
import { MobileHeader, MobileNav } from './MobileNav'
import { CommandMenu, ToastViewport } from '../components/ui'
import { Inspector } from '../components/inspector/Inspector'

export function MobileWorkspace() {
  const section = useAppStore((s) => s.section)

  return (
    <div className="min-h-screen">
      <MobileHeader />
      <main className="px-4 pb-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px)+24px)] pt-4">
        <div key={section} className="page-enter">
          <PageRouter section={section} />
        </div>
      </main>
      <MobileNav />
      <Inspector />
      <CommandMenu />
      <ToastViewport />
    </div>
  )
}
