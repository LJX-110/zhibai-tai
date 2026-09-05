/**
 * Seal —— 瓦当篆符（核心图腾 / 视觉语言）
 * 形制取秦汉瓦当：粗轮 + 弦纹 + 四向箭头纹；中心「异」以秦篆笔意
 * 手绘路径盘出（不依赖字体）；其余印文走书法字体回退，并以
 * 同色圆头描边做"篆意化"——笔画端点圆起圆收，接近篆笔质感。
 * 用于 专注标记 / 待办与作业完成勾 / 财务收支印 / 收藏 / 完成盖章。
 */
import { cn } from '../../utils/cn'

export interface SealProps {
  /** 印文（默认「异」；其余走篆意化回退） */
  char?: string
  size?: number
  tone?: 'cinnabar' | 'bronze' | 'plain' | 'teal'
  /** 旋转（模拟盖印歪斜） */
  rotate?: number
  className?: string
  title?: string
}

const toneStroke: Record<NonNullable<SealProps['tone']>, string> = {
  cinnabar: 'var(--color-cinnabar)',
  bronze: 'var(--color-gold-deep)',
  plain: 'var(--color-ink-muted)',
  teal: 'var(--color-teal)',
}

/** 秦篆笔意「异」：上卷起笔 / S 形中轴 / 对称垂钩 / 平脚收笔 */
const SEAL_YI_PATHS = [
  { d: 'M21 23 Q32 13.5 43 23', w: 3.4 },
  { d: 'M32 17 C26 24 38 28.5 32 35.5 C26 42.5 38 47 32 51', w: 3.2 },
  { d: 'M19.5 34 Q32 27 44.5 34', w: 2.8 },
  { d: 'M24 35 q0 6 4.5 8.5 M40 35 q0 6 -4.5 8.5', w: 2.4 },
  { d: 'M23.5 51.5 h17', w: 3.4 },
]

export function Seal({ char = '异', size = 28, tone = 'cinnabar', rotate = 0, className, title }: SealProps) {
  const stroke = toneStroke[tone]
  // 小尺寸（<24px）省去弦纹与箭头纹，保留轮 + 篆文，保证缩到 18px 依然清晰
  const detail = size >= 24
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn('shrink-0 select-none', className)}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
      role="img"
      aria-label={title ?? `${char}符`}
    >
      {/* 瓦当外轮 + 弦纹 */}
      <circle cx="32" cy="32" r="29.5" fill="none" stroke={stroke} strokeWidth="3.2" />
      {detail && (
        <circle cx="32" cy="32" r="25" fill="none" stroke={stroke} strokeWidth="0.9" opacity="0.7" />
      )}
      {/* 四向箭头纹（瓦当标志性母题） */}
      {detail && (
        <g fill={stroke}>
          <path d="M28.5 4.5 L35.5 4.5 L32 12 Z" />
          <path d="M28.5 59.5 L35.5 59.5 L32 52 Z" />
          <path d="M4.5 28.5 L4.5 35.5 L12 32 Z" />
          <path d="M59.5 28.5 L59.5 35.5 L52 32 Z" />
        </g>
      )}
      {/* 印文 */}
      {char === '异' ? (
        <g fill="none" stroke={stroke} strokeLinecap="round">
          {SEAL_YI_PATHS.map((p, i) => (
            <path key={i} d={p.d} strokeWidth={detail ? p.w : p.w + 0.4} />
          ))}
        </g>
      ) : (
        /* 篆意化回退：纵势字形 + 同色圆头描边（笔画圆起圆收） */
        <text
          x="32"
          y="41.5"
          textAnchor="middle"
          fontSize="26"
          fontWeight="500"
          fontFamily="var(--font-deco)"
          fill={stroke}
          stroke={stroke}
          strokeWidth="1.1"
          strokeLinejoin="round"
          transform="scale(0.94, 1.14)"
          style={{ transformOrigin: '32px 32px' }}
        >
          {char}
        </text>
      )}
    </svg>
  )
}
