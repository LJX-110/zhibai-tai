/**
 * ErrorBoundary —— 错误边界
 *
 * 捕获子树渲染期异常，降级为可读的错误卡片，避免整页白屏。
 * 两处挂载：
 *   · App 根 —— 兜底，任何未捕获异常都不会让用户面对空白页
 *   · PageRouter —— 按页隔离，切换导航（resetKey 变化）自动恢复
 *
 * 说明：React 错误边界只捕获渲染/lifecycle 异常。
 * 事件回调与异步任务中的错误由 `services/error-log.ts` 的全局处理器兜底
 * （在 main.tsx 里安装），这里只额外把渲染异常也记进同一份故障流水。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert, RefreshCw } from 'lucide-react'
// 深路径导入：barrel 会拉入 CommandMenu→stores，与本层形成重量级依赖
import { Button } from '../components/ui/Button'
import { recordError } from '../services/error-log'

interface Props {
  children: ReactNode
  /** 此值变化时自动清除错误态（用于路由切换后自愈） */
  resetKey?: string
  /** 降级标题 */
  title?: string
  /** 隐藏"重试"，仅保留重新加载（根边界用） */
  hideRetry?: boolean
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 仅记录到控制台，不写入任何用户数据
    console.error('[知白台] 渲染异常:', error, info.componentStack)
    // 同时进故障流水：控制台是要用户开 DevTools 才看得到的，
    // 而设置页的记录他随时能翻 —— 这正是「白屏 / 点了没反应」类反馈唯一的线索来源
    recordError({
      kind: 'render',
      message: error.message || error.name || '渲染异常',
      where: this.props.title ?? '页面渲染',
      detail: info.componentStack ?? error.stack,
    })
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private handleRetry = () => this.setState({ error: null })

  private handleReload = () => window.location.reload()

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const message = error.message || String(error)

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-[260px] w-full items-center justify-center p-6"
      >
        <div className="w-full max-w-[460px] rounded-paper border border-line bg-surface p-6 shadow-float">
          <div className="mb-3 flex items-center gap-2 text-cinnabar">
            <TriangleAlert size={18} aria-hidden />
            <h2 className="text-base font-medium text-ink">
              {this.props.title ?? '此处出了岔子'}
            </h2>
          </div>

          <p className="mb-1 text-sm text-ink-soft">
            页面渲染时发生异常，已阻止崩溃继续扩散。
          </p>
          <p className="mb-4 text-sm text-ink-muted">
            你的数据仍保存在本地，未受影响。
          </p>

          <pre className="mb-4 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-control bg-nested p-2.5 text-xs leading-relaxed text-ink-faint">
            {message.length > 300 ? `${message.slice(0, 300)}…` : message}
          </pre>

          <div className="flex flex-wrap gap-2">
            {!this.props.hideRetry && (
              <Button variant="primary" size="sm" onClick={this.handleRetry}>
                <RefreshCw size={14} aria-hidden />
                重试
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={this.handleReload}>
              重新加载
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
