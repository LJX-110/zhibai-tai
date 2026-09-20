/**
 * 奇 · 页面专属的纯展示零件（常用工具入口 / 九宫盘面）
 * 两者都不读 store、不持状态，可独立渲染与复用。
 */
import { History } from 'lucide-react'
import { BAGUA } from '../../services/divination'
import { Taiji } from '../../components/ui/Taiji'

/** 常用工具入口 */
export function ToolTile({
  icon: Icon,
  label,
  desc,
  onClick,
}: {
  icon: typeof History
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-tile border border-line bg-paper/50 px-4 py-3 text-left transition-colors hover:border-cinnabar/40 hover:bg-cinnabar/5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-raised text-ink-muted group-hover:text-cinnabar">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-faint">{desc}</span>
      </span>
    </button>
  )
}

/** 九宫格盘面（洛书数位 · 天干/八门/九星/八神） */
export function BaguaWheel() {
  const R = 46
  const bagua = [...BAGUA]
  // 五行：恰好五个，沿中环均布（各配五行色小印）
  const WUXING = [
    { el: '金', color: 'var(--color-module-3)' },
    { el: '木', color: 'var(--color-module-4)' },
    { el: '水', color: 'var(--color-module-2)' },
    { el: '火', color: 'var(--color-module-1)' },
    { el: '土', color: 'var(--color-module-5)' },
  ]
  const angle = (i: number, n: number) => ((i * 360) / n - 90) * (Math.PI / 180)
  const pt = (r: number, a: number) => ({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r })

  return (
    <div className="mx-auto flex max-w-[380px] flex-col items-center">
      <div className="relative w-full">
        <svg viewBox="0 0 100 100" className="w-full">
          {/* 外环 + 鎏金环（骨架全部鎏金，弃灰） */}
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.8" opacity="0.9" />
          <circle cx="50" cy="50" r={R - 6} fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.4" strokeDasharray="1 2" opacity="0.55" />
          <circle cx="50" cy="50" r="42.5" fill="none" stroke="var(--color-gold-btn)" strokeWidth="0.3" strokeDasharray="0.6 2" opacity="0.7" />
          {/* 24 刻度（仅此组旋转；四正位朱砂强调；内端让开八卦圈；余者鎏金） */}
          <g className="compass-ring">
            {Array.from({ length: 24 }, (_, i) => {
              const a = angle(i, 24)
              const r1 = R - (i % 3 === 0 ? 2.6 : 1.6)
              const p1 = pt(r1, a)
              const p2 = pt(R, a)
              const cardinal = i % 6 === 0
              return (
                <line
                  key={i}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={cardinal ? 'var(--color-cinnabar)' : 'var(--color-gold-btn)'}
                  strokeWidth={cardinal ? 0.7 : i % 3 === 0 ? 0.5 : 0.35}
                  opacity={cardinal ? 0.8 : 0.6}
                />
              )
            })}
          </g>
          {/* 四方方位字与刻度/卦位相撞，改为省略（方位由卦名圈内的卦名表达） */}
          {/* 中环：五行（恰五个，固定不转；半径 27 与外环八卦留出净空） */}
          {WUXING.map((el, i) => {
            const a = angle(i, 5)
            const p = pt(27, a)
            return (
              <g key={el.el}>
                <rect
                  x={p.x - 2.8}
                  y={p.y - 2.8}
                  width="5.6"
                  height="5.6"
                  rx="0.7"
                  transform={`rotate(45 ${p.x} ${p.y})`}
                  fill={el.color}
                  opacity="0.92"
                />
                <text
                  x={p.x}
                  y={p.y + 1}
                  textAnchor="middle"
                  fontSize="3.8"
                  fill="var(--color-panel)"
                  style={{ fontFamily: 'var(--font-deco)' }}
                >
                  {el.el}
                </text>
              </g>
            )
          })}
          {/* 外环：八卦（半径 37，卦名收进圆内，不再与刻度相撞） */}
          {bagua.map((b, i) => {
            const a = angle(i, 8)
            const p = pt(37, a)
            return (
              <g key={b.key}>
                <circle cx={p.x} cy={p.y} r="5.2" fill="var(--color-panel)" stroke="var(--color-gold-btn)" strokeWidth="0.45" opacity="0.95" />
                <text x={p.x} y={p.y - 0.4} textAnchor="middle" fontSize="5.4" fill="var(--color-ink)" style={{ fontFamily: 'var(--font-deco)' }}>
                  {b.symbol}
                </text>
                <text x={p.x} y={p.y + 3.4} textAnchor="middle" fontSize="2.1" fill="var(--color-ink-faint)">
                  {b.name}
                </text>
              </g>
            )
          })}
          {/* 内环：阴阳 */}
          <circle cx="50" cy="50" r="19" fill="none" stroke="var(--color-cinnabar)" strokeWidth="0.5" opacity="0.55" />
          <circle cx="50" cy="50" r="19" fill="none" stroke="var(--color-cinnabar)" strokeWidth="0.5" strokeDasharray="6 1 2 1" opacity="0.35" />
        </svg>
        {/* 中心太极（当前状态）：同观页锚定真实圆心，不依赖容器内容分布 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Taiji size={34} />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-faint">异术阵 · 外环八卦 · 中环五行 · 内环阴阳 · 中心太极</p>
    </div>
  )
}
