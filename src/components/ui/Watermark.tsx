/**
 * TaijiWatermark —— 蓝白 / 红白太极水印
 * 颜色走 CSS 变量（tokens.css 的 --wm-blue/--wm-red），随主题自动翻转：
 * 浅色 = 黛蓝/绛红实色，深色 = 提亮版。
 * 可选 ring：外圈先天八卦刻度环（形制参考 xilzy 先天八卦图）。
 *
 * 用法：<TaijiWatermark variant="blue" ring className="..." opacity={0.35} />
 */

import type { CSSProperties } from 'react'

interface TaijiWatermarkProps {
  className?: string
  /** 定位等样式直接写 inline style（Tailwind 负值类在个别环境不生成，inline 100% 可靠） */
  style?: CSSProperties
  /** 整体不透明度（默认 0.5） */
  opacity?: number
  /** 渐变 id 前缀：同页多实例时传不同值避免 id 冲突 */
  id?: string
  /** 配色变体：blue=黛蓝阴鱼（默认） red=绛红阴鱼 */
  variant?: 'blue' | 'red'
  /** 外圈先天八卦刻度环（细环 + 8 组短刻度，克制） */
  ring?: boolean
}

export function TaijiWatermark({
  className,
  style,
  opacity = 0.5,
  id = 'tw',
  variant = 'blue',
  ring = false,
}: TaijiWatermarkProps) {
  const fish = variant === 'red' ? 'var(--wm-red)' : 'var(--wm-blue)'
  const glowId = `${id}-${variant}-glow`
  const discId = `${id}-${variant}-disc`
  const cx = 60
  const cy = 60
  return (
    <div aria-hidden="true" className={className} style={{ opacity, ...style }}>
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <defs>
          <radialGradient id={`${glowId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`var(--wm-${variant}-glow)`} stopOpacity="1" />
            <stop offset="55%" stopColor={`var(--wm-${variant}-glow)`} stopOpacity="0.5" />
            <stop offset="100%" stopColor={`var(--wm-${variant}-glow)`} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${discId}`} cx="42%" cy="36%" r="72%">
            <stop offset="0%" stopColor="var(--color-raised)" />
            <stop offset="100%" stopColor="var(--color-nested)" />
          </radialGradient>
        </defs>
        {/* 柔光 */}
        <circle cx={cx} cy={cy} r="56" fill={`url(#${glowId})`} />
        {/* 渐变底盘 + 细边 */}
        <circle cx={cx} cy={cy} r="40" fill={`url(#${discId})`} stroke="#9db8d2" strokeWidth="1.2" />
        {/* 先天八卦刻度环（可选）：细环 + 8 组短刻度 */}
        {ring && (
          <g stroke={fish} strokeOpacity="0.45" strokeWidth="1.4">
            <circle cx={cx} cy={cy} r="47" fill="none" strokeOpacity="0.3" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
              const a = (deg * Math.PI) / 180
              const x1 = cx + 44 * Math.cos(a)
              const y1 = cy + 44 * Math.sin(a)
              const x2 = cx + 50 * Math.cos(a)
              const y2 = cy + 50 * Math.sin(a)
              return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} strokeLinecap="round" />
            })}
          </g>
        )}
        {/* 阴阳鱼：阴鱼 = 主色，阳鱼 = 纸白 */}
        <g>
          <path
            d="M 60 22 A 38 38 0 0 0 60 98 A 19 19 0 0 0 60 60 A 19 19 0 0 1 60 22 Z"
            fill={fish}
          />
          <circle cx="60" cy="41" r="19" fill={fish} />
          <circle cx="60" cy="79" r="19" fill="var(--color-paper)" />
          <circle cx="60" cy="41" r="7" fill="var(--color-paper)" />
          <circle cx="60" cy="79" r="7" fill={fish} />
        </g>
      </svg>
    </div>
  )
}
