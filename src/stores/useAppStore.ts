/**
 * 应用级 store —— 当前导航 + 布局模式
 *
 * 导航与 URL hash 双向同步：
 *  · 深链接：#/finance 直接打开财页（刷新不再回到首页）
 *  · 浏览器前进/后退：hashchange → 回放导航历史
 *  · setSection 写 hash 形成历史记录；hashchange 回放时同值跳过，避免循环
 */
import { create } from 'zustand'
import { ALL_SECTIONS, type SectionId } from '../app/navigation'

export type LayoutMode = 'auto' | 'desktop' | 'mobile'

interface AppState {
  /** 当前一级导航 */
  section: SectionId
  setSection: (s: SectionId) => void
  /** v0.4 桌面专注模式（隐藏侧栏/顶栏，只留任务+番茄钟+时间） */
  focusMode: boolean
  setFocusMode: (v: boolean) => void
}

function sectionFromHash(): SectionId {
  if (typeof location === 'undefined') return 'overview'
  const h = location.hash.replace(/^#\/?/, '')
  return ALL_SECTIONS.some((s) => s.id === h) ? (h as SectionId) : 'overview'
}

function writeHash(s: SectionId): void {
  try {
    if (typeof location !== 'undefined' && location.hash !== `#/${s}`) {
      location.hash = `/${s}`
    }
  } catch {
    // 某些嵌入式 WebView 禁止写 hash：路由降级为纯内存态，不影响使用
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  section: sectionFromHash(),
  setSection: (section) => {
    if (get().section === section) return
    set({ section })
    writeHash(section)
  },
  focusMode: false,
  setFocusMode: (focusMode) => set({ focusMode }),
}))

// 浏览器前进/后退：hash 变化回放到 store（store → hash 已由 setSection 写过，
// 同值时此处不重复 set，两条路径互不触发对方，无循环）
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const s = sectionFromHash()
    if (useAppStore.getState().section !== s) {
      useAppStore.setState({ section: s })
    }
  })
}
