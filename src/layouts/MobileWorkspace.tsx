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
      {/* 左右取 max(原 16px, 安全区)：横屏刘海时 16px 不够，会压住内容；
          竖屏安全区为 0，max 保证与从前逐像素一致（零视觉回归）。
          底部预算 = 底栏高度 + 安全区 + 24 —— 与 MobileNav 的 height(w calc) 严格对齐。 */}
      <main className="pb-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px)+24px)] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-4">
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
