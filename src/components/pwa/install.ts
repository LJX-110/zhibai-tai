/**
 * PWA 安装能力 —— 判定与安装事件捕获（InstallPrompt 与设置页共用）
 *
 * 抽出来的原因：底部提示条与「系统 · 安装」区块都要判断"能不能装、要不要引导"，
 * 各写一遍必然分叉。而且 `beforeinstallprompt` 事件只会触发一次、事件对象用完即废，
 * 必须由单一模块捕获并保管，组件通过订阅读取。
 */

/** Chrome 系未标准化的事件类型（lib DOM 尚未收录） */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/** 是否已以独立窗口运行（即已经装过） */
export function isStandalone(): boolean {
  // jsdom 等无 matchMedia 的环境直接判否，避免渲染即崩溃
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** 是否 iOS / iPadOS —— 它们无法程序化安装，只能给「添加到主屏幕」的分步指引 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true
  // iPadOS 13+ 伪装成 macOS 桌面 UA，靠触点数识别
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

/** 只在应用启动时调用一次：捕获浏览器给出的安装时机 */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    // 拦下默认迷你条，由我们决定何时、以什么样子提示
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

/** 供 useSyncExternalStore 订阅 */
export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 当前是否握着可用的安装时机 */
export function hasInstallPrompt(): boolean {
  return deferred !== null
}

/** 服务端/无事件环境下的快照 */
export function noInstallPrompt(): boolean {
  return false
}

/** 触发安装；返回用户的选择结果 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  // 事件对象只能用一次，无论结果如何都释放，避免重复弹
  deferred = null
  emit()
  return outcome
}
