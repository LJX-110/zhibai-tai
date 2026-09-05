/**
 * App —— 应用外壳
 * 主题应用 + 首次引导 + 布局模式切换
 */
import { Bootstrap, useBootStore } from './Bootstrap'
import { BootScreen } from './BootScreen'
import { ErrorBoundary } from './ErrorBoundary'
import { Hotkeys } from './Hotkeys'
import { ThemeApplier } from './ThemeApplier'
import { Onboarding } from './Onboarding'
import { NotificationGate } from '../components/notification/NotificationGate'
import { AmbientSound } from '../components/sound/AmbientSound'
import { PomodoroTicker } from '../components/pomodoro/PomodoroTicker'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useResolvedLayout } from '../layouts/useResolvedLayout'
import { DesktopWorkspace } from '../layouts/DesktopWorkspace'
import { MobileWorkspace } from '../layouts/MobileWorkspace'

export default function App() {
  useAppStore()
  const layout = useResolvedLayout()
  const onboarded = useSettingsStore((s) => s.onboarded)
  const bootReady = useBootStore((s) => s.ready)

  return (
    // 根边界兜底：任何未捕获异常都降级为可读提示，绝不白屏
    <ErrorBoundary title="应用启动异常" hideRetry>
      <>
        <ThemeApplier />
        <Bootstrap />
        <Hotkeys />
        <NotificationGate />
        <AmbientSound />
        <PomodoroTicker />
        {onboarded ? (
          // 就绪门：数据载入前显示启动屏，避免"空数据"闪烁
          bootReady ? (
            layout === 'mobile' ? (
              <MobileWorkspace />
            ) : (
              <DesktopWorkspace />
            )
          ) : (
            <BootScreen />
          )
        ) : (
          <Onboarding />
        )}
      </>
    </ErrorBoundary>
  )
}
