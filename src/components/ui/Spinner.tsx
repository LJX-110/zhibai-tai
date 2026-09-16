/**
 * Spinner —— 统一加载指示（黛蓝+鎏金太极旋转）
 *
 * 加载动画标准：
 *  · 整页/整块加载 —— 用本组件的太极旋转（BootScreen / index.html 占位同款配色）
 *  · 按钮内加载 —— 用图标自身旋转（RefreshCw + animate-spin 或 SpinCw 图标）
 * 不用白色 Taiji 品牌印记做加载：白太极在浅色纸上对比过低（此前 BootScreen 就存在这问题）。
 */
export function Spinner({ size = 44, label }: { size?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
      <span className="spin-smooth" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <clipPath id="zbt-spin-half">
              <rect x="50" y="0" width="50" height="100" />
            </clipPath>
            <clipPath id="zbt-spin-q">
              <circle cx="50" cy="50" r="50" />
              <circle cx="75" cy="50" r="25" fill="white" />
            </clipPath>
          </defs>
          <circle cx="50" cy="50" r="46" fill="var(--color-teal)" />
          <circle cx="50" cy="50" r="46" fill="var(--color-bronze)" clipPath="url(#zbt-spin-half)" />
          <circle cx="50" cy="37" r="12" fill="var(--color-teal)" clipPath="url(#zbt-spin-q)" />
          <circle cx="50" cy="63" r="12" fill="var(--color-bronze)" />
        </svg>
      </span>
      {label && <p className="text-sm text-ink-faint">{label}</p>}
    </div>
  )
}