/**
 * Taiji —— 太极品牌印记（黑白阴阳，随底色自适应明暗）
 * 替代「衡」朱砂印作为品牌标记，兼作罗盘中心印记
 *
 * 旋转动画（spin-smooth）挂在包裹 div 上而非 svg：
 * div 是普通盒模型，各浏览器都能稳定提升为合成层；
 * svg 走矢量重栅格化路径，主线程繁忙时旋转易掉帧。
 */
export function Taiji({
  size = 40,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <div className={className} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="47" fill="var(--color-on-sidebar)" />
        <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(8, 10, 14, 0.5)" strokeWidth="1.5" />
        <path
          d="M50 3 A47 47 0 0 1 50 97 A23.5 23.5 0 0 1 50 50 A23.5 23.5 0 0 0 50 3 Z"
          fill="rgba(8, 10, 14, 0.92)"
        />
        <circle cx="50" cy="26.5" r="8.5" fill="rgba(8, 10, 14, 0.92)" />
        <circle cx="50" cy="73.5" r="8.5" fill="var(--color-on-sidebar)" />
      </svg>
    </div>
  )
}
