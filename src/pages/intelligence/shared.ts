/**
 * 情 · 情报页 —— 页面专属的常量与纯工具（无 React 依赖）
 * 只放「主页面与子组件都要用」的东西，避免各处重复定义导致漂移。
 */
import type { KeyboardEvent } from 'react'
import type { SourceType } from '../../types/entities'
import type { SkippedSource, SourceFetchFailure } from '../../services/intelligence/run'

export const SOURCE_OPTIONS: { value: SourceType | 'all'; label: string }[] = [
  { value: 'all', label: '全部来源' },
  { value: 'bilibili', label: 'B 站' },
  { value: 'github', label: 'GitHub' },
  { value: 'rss', label: 'RSS' },
  { value: 'official', label: '官方' },
  { value: 'ai', label: 'AI' },
  { value: 'web', label: 'Web' },
  { value: 'game', label: '游戏' },
  { value: 'anime', label: '动漫' },
]

export const TIME_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: '3d', label: '近 3 天' },
  { value: '7d', label: '近 7 天' },
]

/** 单次渲染条数：够首屏铺设，又不至于把几百条带图的行一次塞进 DOM */
export const PAGE_SIZE = 40

/** 最近一次抓取的结果：失败源要留在界面上，而不是只在 toast 里闪一下 */
export interface FetchReport {
  added: number
  failures: SourceFetchFailure[]
  /** 因连续失败被退避跳过的源：它们没发请求，不该显示成红色错误 */
  skipped: SkippedSource[]
}

/**
 * 键盘可达：信息流整行是 role="button" 的 div —— 它能被 Tab 聚焦，
 * 但原生不会因为按 Enter/Space 就触发点击，只用键盘的用户等于打不开详情。
 * 这里补齐两个按键；Space 必须 preventDefault，否则浏览器会顺势把页面滚下半屏。
 *
 * 为什么不把外层直接换成 <button>：行内还嵌着「收藏 / 稍后读 / 详情」三个按钮，
 * 按钮套按钮是非法结构，读屏与浏览器的行为都不可预期（见 FeedActions 里对
 * keydown/click 的 stopPropagation，内层按键不会被这里误当成"打开行"）。
 */
export const rowKeyDown = (open: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    open()
  }
}
