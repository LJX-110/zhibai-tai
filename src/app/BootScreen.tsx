/**
 * 启动屏 —— 数据就绪前的品牌页
 *
 * 结构与 class 与 index.html 里的静态占位**完全一致**（那段 <style> 常驻页面），
 * 所以 React 接管时既不换色也不换字号、不位移，唯一变化是进度条
 * 由「静态推进动画」移交为「真实启动进度」。
 *
 * 就绪后不立即卸载：先淡出，让下层工作台自然露出来，避免硬切。
 * 品牌字刻意用系统衬线栈 —— 书法字体全字集 woff2 有数 MB，
 * 启动期 font-display:swap 换字会触发重排，连带旋转动画掉帧。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useBootStore } from './Bootstrap'

/** 淡出时长，与 index.html 中 .boot 的 transition 保持一致 */
const LEAVE_MS = 420

export function BootScreen() {
  const ready = useBootStore((s) => s.ready)
  // 进度条宽度交给 CSS 时间动画（见 index.html 的 .boot-fill），
  // 这里只负责阶段文案与「就绪时补满最后一段」
  const step = useBootStore((s) => s.step)
  const [mounted, setMounted] = useState(true)
  const fillRef = useRef<HTMLElement>(null)

  // 续接静态占位的进度动画：React 接管时会用全新 .boot-fill 元素替换静态那个，
  // 若放任不管，进度条会从 6% 重新跑一遍（慢网下静态早已跑到 80%+，会肉眼回跳）。
  // 用负的 animation-delay 让进度从「首帧至今」对应的位置继续，与静态占位无缝衔接。
  // useLayoutEffect 在绘制前写好内联 delay，避免任何一帧闪回 6%。
  useLayoutEffect(() => {
    const el = fillRef.current
    const start = (window as unknown as { __bootStart?: number }).__bootStart
    if (!el || typeof start !== 'number') return
    const elapsed = Math.min(performance.now() - start, 900)
    if (elapsed > 0) el.style.animationDelay = `-${elapsed}ms`
  }, [])

  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => setMounted(false), LEAVE_MS)
    return () => window.clearTimeout(t)
  }, [ready])

  if (!mounted) return null

  return (
    <div
      className="boot"
      data-leaving={ready ? 'true' : undefined}
      role="status"
      aria-live="polite"
    >
      <div className="boot-mark">
        {/* 阴阳鱼用一条 path 直接画：clipPath 内多个子形状取并集、不会相减，
            靠叠加「挖洞」画不出阴阳分界 */}
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle className="bm-b" cx="50" cy="50" r="46" />
          <path
            className="bm-a"
            d="M50 4 A46 46 0 0 1 50 96 A23 23 0 0 1 50 50 A23 23 0 0 0 50 4 Z"
          />
          <circle className="bm-a" cx="50" cy="27" r="8.3" />
          <circle className="bm-b" cx="50" cy="73" r="8.3" />
          <circle className="bm-ring" cx="50" cy="50" r="45.6" />
        </svg>
      </div>
      <p className="boot-name">知白台</p>
      <p className="boot-poem">知其白，守其黑</p>
      <div className="boot-track">
        <i className="boot-fill" data-done={ready || undefined} ref={fillRef} />
      </div>
      <p className="boot-step">{ready ? '文房已备' : step}</p>
    </div>
  )
}
