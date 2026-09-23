/**
 * 主题色 —— 状态栏 / 标题栏配色的**单一事实源**
 *
 * ## 为什么不能写死在 meta 里
 * 侧栏在浅色主题是黛蓝、深色主题是绛红（`styles/tokens.css` 的 `--sidebar`）。
 * 而 `<meta name="theme-color">` 只接受一个值，于是安装成 PWA 后，
 * 系统绘制的那条状态栏/标题栏永远只与其中一个主题同色 ——
 * 深色主题（应用默认）下表现为**顶部一条不属于应用的色带**，看起来就是"没铺满"。
 *
 * 故：HTML 里那个值只作首屏占位，`index.html` 的预判脚本在首次绘制前改写它，
 * 之后由 `ThemeApplier` 跟随主题持续同步 —— 与 `data-theme` 同进同出。
 *
 * ⚠️ 改这里就要同步改 `index.html` 里那份内联取值（那段脚本没法 import 模块），
 * 以及 `vite.config.ts` 的 `manifest.theme_color`（启动图标/任务切换卡的底色）。
 */
export type ResolvedTheme = 'light' | 'dark'

/** 与 `--sidebar` 严格同色（浅色黛蓝 / 深色绛红）—— 只供下面的写入函数使用，不外传 */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#2e5a8c',
  dark: '#5c1f1a',
}

/** 把主题色写进 `<meta name="theme-color">`；meta 不存在时安静跳过（非浏览器环境/测试） */
export function applyThemeColor(theme: ResolvedTheme): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}
