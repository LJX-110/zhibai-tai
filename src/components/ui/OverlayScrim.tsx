/**
 * OverlayScrim —— 弹层遮罩（Dialog / Sheet / Inspector 共用同一形制）
 *
 * 为什么要抽：三家原先都是「各写一层 absolute inset-0 bg-ink/40」，
 * 于是 Inspector 漏了淡入、三家又都忘了给遮罩模糊 —— 同一次开合
 * 在不同组件下观感不一样。遮罩是三者唯一完全相同的部分，收敛成一处。
 * 定位（居中 / 贴底 / 侧边）属于各自的差异，留在各自组件里。
 *
 * backdrop-blur 极轻（2px）：遮罩只压暗 40%，弹层与页面同为浅色面
 * （.talisman 与 .paper 明度接近），不加一点模糊时弹层"浮"不起来。
 */
export function OverlayScrim({ onClose }: { onClose: () => void }) {
  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] anim-fade"
    />
  )
}
