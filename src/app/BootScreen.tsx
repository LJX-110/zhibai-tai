/**
 * 启动屏 —— 数据就绪前的工作台占位
 * 避免冷启动时先渲染出"空数据"列表再跳变的闪烁
 *
 * 文案刻意用系统字体：书法字体全字集 woff2 有数 MB，
 * font-display:swap 会在启动期间换字触发重排，连带太极动画掉帧。
 */
import { Taiji } from '../components/ui/Taiji'

export function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
      <Taiji size={48} className="spin-smooth" />
      <p className="text-sm text-ink-faint">正在铺开文房 …</p>
    </div>
  )
}
