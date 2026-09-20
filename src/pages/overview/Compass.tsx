/**
 * 观 · 今日炁象罗盘（四象方位牌 + 环形进度 + 中央太极）
 * 纯展示：只依赖传入的 qiDims 与 gradeTitle。
 */
import { useResolvedLayout } from '../../layouts/useResolvedLayout'
import { Taiji } from '../../components/ui'
import { cn } from '../../utils/cn'
import { DIM_COLOR, type QiDim } from './shared'

/** 微型环形进度（四象节点） */
function RingGauge({ value, max, color, size = 40 }: { value: number; max: number; color: string; size?: number }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const p = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        style={{ transition: 'stroke-dasharray 600ms var(--ease-standard)' }}
      />
    </svg>
  )
}

/** 四象节点（罗盘方位牌）；窄屏用 'block' 排进 2×2 网格，不再绝对定位互挤 */
function QuadNode({
  beast,
  char,
  dim,
  pos,
}: {
  beast: string
  char: string
  dim: QiDim
  pos: 'top' | 'bottom' | 'left' | 'right' | 'block'
}) {
  const color = DIM_COLOR[dim.tone]
  const posClass = {
    top: 'absolute left-1/2 top-0 w-[120px] -translate-x-1/2',
    bottom: 'absolute left-1/2 bottom-0 w-[120px] -translate-x-1/2',
    left: 'absolute left-0 top-1/2 w-[120px] -translate-y-1/2',
    right: 'absolute right-0 top-1/2 w-[120px] -translate-y-1/2',
    block: 'w-full',
  }[pos]
  return (
    <div className={cn('flex flex-col items-center gap-1 rounded-tile border border-line bg-paper/75 px-2 py-1.5', posClass)}>
      {/* 字号交给 .mono-meta（12px 令牌）：原先的 text-[9px] 位于工具层，
          会被 index.css 里未分层的 .mono-meta 静默压掉，从未生效 */}
      <span className="mono-meta text-ink-faint">
        {char} · {beast}
      </span>
      <div className="flex items-center gap-1.5">
        <RingGauge value={dim.value} max={dim.max} color={color} size={32} />
        <div className="flex flex-col items-start">
          <span className="scribal-title text-sm leading-none" style={{ color }}>
            {dim.label}
          </span>
          <span className="mt-0.5 text-xs leading-tight text-ink-muted">{dim.sub}</span>
        </div>
      </div>
    </div>
  )
}

/** 四象罗盘 —— 今日炁象（外环八卦固定 · 24 刻度缓转 · 四象方位牌 · 中央太极）
 *  窄屏收起刻度环与八卦环，四象牌改为太极下方 2×2 —— 罗盘不再独占一整屏，
 *  四块方位牌也不会在 375px 宽下互相压字。 */
export function FourSymbolsCompass({ qiDims, gradeTitle }: { qiDims: QiDim[]; gradeTitle: string }) {
  const compact = useResolvedLayout() === 'mobile'
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 * Math.PI) / 180
    const cardinal = i % 6 === 0
    const r1 = cardinal ? 176 : 164
    const r2 = cardinal ? 160 : 154
    return {
      x1: 180 + r1 * Math.cos(a),
      y1: 180 + r1 * Math.sin(a),
      x2: 180 + r2 * Math.cos(a),
      y2: 180 + r2 * Math.sin(a),
      cardinal,
    }
  })
  const TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷']
  return (
    <div>
      <div
        className={cn(
          'relative mx-auto aspect-square w-full select-none',
          compact ? 'max-w-[240px]' : 'max-w-[460px]',
        )}
      >
        <svg viewBox="0 0 360 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {/* 外环（鎏金骨架） */}
          <circle cx="180" cy="180" r="164" fill="none" stroke="var(--color-gold-btn)" strokeWidth="1.2" opacity="0.85" />
          <circle cx="180" cy="180" r="151" fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.5" strokeDasharray="2 5" opacity="0.55" />
          {/* 八卦环（固定，不随转；窄屏省略） */}
          {!compact &&
            TRIGRAMS.map((t, i) => {
              const a = ((i * 45 - 90) * Math.PI) / 180
              return (
                <text
                  key={t}
                  x={180 + 146 * Math.cos(a)}
                  y={180 + 146 * Math.sin(a)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="10"
                  fill="var(--color-gold-btn)"
                  opacity="0.85"
                >
                  {t}
                </text>
              )
            })}
          {/* 24 刻度（缓转，四正位朱砂强调，余者鎏金；窄屏省略） */}
          {!compact && (
            <g className="compass-ring">
              {ticks.map((t, i) => (
                <line
                  key={i}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  stroke={t.cardinal ? 'var(--color-cinnabar)' : 'var(--color-gold-btn)'}
                  strokeWidth={t.cardinal ? 1 : 0.7}
                  opacity={t.cardinal ? 0.85 : 0.65}
                />
              ))}
            </g>
          )}
          {/* 中环 */}
          <circle cx="180" cy="180" r="104" fill="none" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.6" />
          {/* 四向虚十字 */}
          <line x1="180" y1="44" x2="180" y2="316" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.4" strokeDasharray="3 5" />
          <line x1="44" y1="180" x2="316" y2="180" stroke="var(--color-gold-btn)" strokeWidth="1" opacity="0.4" strokeDasharray="3 5" />
        </svg>
        {/* 中央太极：锚定 svg 真实圆心（180,180）。
            此前用 inset-0 容器居中包住"太极+文字"纵向堆叠，
            文字把太极顶离了圆心约 15px —— 现太极独占圆心，文字锚在其下 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Taiji size={compact ? 40 : 52} className="glow-bronze" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-[32px]">
          <div className="scribal-title text-lg text-ink">{gradeTitle}</div>
        </div>
        {!compact && (
          <>
            {/* 四象 */}
            <QuadNode pos="right" beast="青龙" char="东" dim={qiDims[0]} />
            <QuadNode pos="bottom" beast="朱雀" char="南" dim={qiDims[1]} />
            <QuadNode pos="left" beast="白虎" char="西" dim={qiDims[2]} />
            <QuadNode pos="top" beast="玄武" char="北" dim={qiDims[3]} />
          </>
        )}
      </div>
      {compact && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <QuadNode pos="block" beast="青龙" char="东" dim={qiDims[0]} />
          <QuadNode pos="block" beast="朱雀" char="南" dim={qiDims[1]} />
          <QuadNode pos="block" beast="白虎" char="西" dim={qiDims[2]} />
          <QuadNode pos="block" beast="玄武" char="北" dim={qiDims[3]} />
        </div>
      )}
    </div>
  )
}
